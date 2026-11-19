import { useCallback, useEffect, useRef, useState } from 'react';
import { alRevocarse, api } from './lib/api';
import { recuperarSesion } from './lib/auth';
import { Spinner } from './components/ui';
import { sesion } from './lib/session';
import { getDeviceId, getPhoneModel, getPushToken } from './lib/bridge';
import { SinConexion } from './screens/SinConexion';
import { Bienvenida } from './screens/Bienvenida';
import { Main } from './screens/Main';
import { SupervisorEntry } from './screens/SupervisorEntry';
import { Supervisor } from './screens/Supervisor';
import { Autorizante } from './screens/Autorizante';
import { CambiarPantalla, type Pantalla } from './components/CambiarPantalla';

/** Espejo de Navigation.kt — mismas rutas y mismas transiciones. */
export type Ruta = 'bienvenida' | 'main' | 'supervisor_entry' | 'supervisor_main' | 'autorizante';

// El boton para saltar entre modo tarja y modo supervisor existe SOLO en el
// telefono de Gaston (mismo device_id fijo que en SessionViewModel.kt).
const MI_TELEFONO_DEVICE_ID = 'fbb9b66cbf60a6e7';

/**
 * Le pasa al servidor el token de notificaciones del telefono (shell 5.1.0+).
 * Se manda si cambio o una vez por dia: el servidor saca los tokens muertos y
 * asi un telefono que estuvo apagado vuelve a quedar anotado solo.
 */
const CLAVE_PUSH = 'staffaxis_push_enviado';
let enviandoPush = false;
async function registrarNotificaciones() {
  const token = getPushToken();
  if (!token || enviandoPush) return;
  const deviceToken = sesion.getDeviceToken();
  const supervisorToken = sesion.getSupervisorToken();
  const autorizanteToken = sesion.getAutorizanteToken();
  if (!deviceToken && !supervisorToken && !autorizanteToken) return;
  let previo: { token?: string; en?: number; quien?: string } = {};
  try { previo = JSON.parse(localStorage.getItem(CLAVE_PUSH) ?? '{}'); } catch { /* vacio */ }
  const quien = deviceToken ? 'dispositivo' : supervisorToken ? 'supervisor' : 'autorizante';
  const unDia = 24 * 60 * 60 * 1000;
  if (previo.token === token && previo.quien === quien && Date.now() - (previo.en ?? 0) < unDia) return;
  enviandoPush = true;
  try {
    if (deviceToken) await api.registrarPushToken(token, getPhoneModel());
    else if (supervisorToken) await api.registrarPushTokenSupervisor(token, getPhoneModel());
    else await api.registrarPushTokenAutorizante(token, getPhoneModel());
    try { localStorage.setItem(CLAVE_PUSH, JSON.stringify({ token, en: Date.now(), quien })); } catch { /* sin storage */ }
  } catch {
    /* sin conexion: se reintenta en el proximo latido */
  } finally {
    enviandoPush = false;
  }
}

function destinoInicial(): Ruta {
  const token = sesion.getDeviceToken();
  const sector = sesion.getSectorActivo();
  if (token && sector) return 'main';
  if (sesion.getSupervisorToken()) return 'supervisor_main';
  if (sesion.getAutorizanteToken()) return 'autorizante';
  return 'bienvenida';
}

export function App() {
  const [ruta, setRuta] = useState<Ruta>(() => destinoInicial());
  // Solo mientras se pregunta si este telefono ya tenia sesion en el servidor.
  const [recuperando, setRecuperando] = useState(() => destinoInicial() === 'bienvenida');
  const [sinConexion, setSinConexion] = useState(() => !navigator.onLine);
  const [recargas, setRecargas] = useState(0);
  const esMiTelefono = useRef(getDeviceId() === MI_TELEFONO_DEVICE_ID).current;

  // Antes de mandar a elegir sector, preguntar si el telefono ya estaba autorizado.
  // Sin esto, pasar del APK nativo al shell hacia que todos tuvieran que elegir su
  // sector de nuevo, aunque el servidor ya supiera cual era.
  useEffect(() => {
    if (!recuperando) return;
    let vivo = true;
    recuperarSesion()
      .then((ok) => { if (vivo && ok) setRuta('main'); })
      .finally(() => { if (vivo) setRecuperando(false); });
    return () => { vivo = false; };
  }, [recuperando]);

  // Revocacion en caliente: un 403 {revoked:true} en cualquier endpoint corta la
  // sesion y vuelve a bienvenida, sin esperar a que reinicien la app.
  useEffect(
    () =>
      alRevocarse(() => {
        sesion.cerrarSesionDispositivo();
        setRuta('bienvenida');
      }),
    [],
  );

  // Heartbeat: cada 25s, mientras haya sesion, para detectar la revocacion aunque
  // el usuario no toque nada. Tambien refresca is_master.
  useEffect(() => {
    // Al abrir no se espera al primer latido: el token suele estar a los pocos segundos.
    const primero = setTimeout(registrarNotificaciones, 4000);
    const id = setInterval(async () => {
      registrarNotificaciones();
      if (!sesion.getDeviceToken()) return;
      try {
        const r = await api.estadoDispositivo();
        if (r?.is_master !== null && r?.is_master !== undefined) sesion.guardarMaestro(r.is_master);
      } catch {
        /* sin conexion: el interceptor ya maneja la revocacion real */
      }
    }, 25_000);
    return () => {
      clearTimeout(primero);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const online = () => setSinConexion(false);
    const offline = () => setSinConexion(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const recargarMain = useCallback(() => setRecargas((n) => n + 1), []);

  // Modo autorizante (Tarja Fuera de Término): solo se muestra la entrada en los
  // telefonos habilitados en el servidor (hoy, el de quien verifica los cortes).
  const [autorizanteHabilitado, setAutorizanteHabilitado] = useState(() => !!sesion.getAutorizanteToken());
  const [errorAutorizante, setErrorAutorizante] = useState<string | null>(null);
  useEffect(() => {
    api.autorizanteHabilitado(getDeviceId())
      .then((r) => setAutorizanteHabilitado(r.habilitado))
      .catch(() => {});
  }, []);
  const entrarComoAutorizante = useCallback(async () => {
    setErrorAutorizante(null);
    if (!sesion.getAutorizanteToken()) {
      try {
        const r = await api.entrarComoAutorizante(getDeviceId());
        sesion.guardarAutorizante(r.token, r.nombre);
      } catch (e) {
        setErrorAutorizante(e instanceof Error ? e.message : 'No se pudo entrar');
        return;
      }
    }
    setRuta('autorizante');
  }, []);
  const salirDeAutorizante = useCallback(() => {
    if (sesion.getDeviceToken() && sesion.getSectorActivo()) setRuta('main');
    else if (sesion.getSupervisorToken()) setRuta('supervisor_main');
    else setRuta('bienvenida');
  }, []);

  if (sinConexion) return <SinConexion onReintentar={() => setSinConexion(!navigator.onLine)} />;
  // Mientras se pregunta si el telefono ya tenia sesion. Dura lo que tarda un
  // pedido; sin esto se veria la bienvenida un instante y despues saltaria solo.
  if (recuperando)
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );

  const pantalla = renderRuta();
  // Solo en el telefono de Gaston: pasar entre encargado, supervisor y
  // autorizante sin cerrar sesiones ni borrar los datos de la app.
  if (esMiTelefono && (ruta === 'main' || ruta === 'supervisor_main' || ruta === 'autorizante')) {
    const opciones: Array<{ id: Pantalla; texto: string }> = [];
    if (sesion.getDeviceToken() && sesion.getSectorActivo()) opciones.push({ id: 'main', texto: 'Encargado (tarja)' });
    if (sesion.getSupervisorToken()) opciones.push({ id: 'supervisor_main', texto: 'Supervisor' });
    if (autorizanteHabilitado) opciones.push({ id: 'autorizante', texto: 'Autorizante' });
    return (
      <>
        {pantalla}
        <CambiarPantalla
          actual={ruta}
          opciones={opciones}
          onElegir={(p) => (p === 'autorizante' ? entrarComoAutorizante() : setRuta(p))}
        />
      </>
    );
  }
  return pantalla;

  function renderRuta() {
  switch (ruta) {
    case 'bienvenida':
      return (
        <Bienvenida
          onNavegar={() => setRuta('main')}
          onEntrarComoSupervisor={() => setRuta('supervisor_entry')}
          onEntrarComoAutorizante={autorizanteHabilitado ? entrarComoAutorizante : undefined}
          errorAutorizante={errorAutorizante}
        />
      );
    case 'main':
      return (
        <Main
          key={recargas}
          onCambiarSector={() => setRuta('bienvenida')}
          onRecargarMain={recargarMain}
          hasSupervisorSession={!!sesion.getSupervisorToken() && esMiTelefono}
          onCambiarASupervisor={() => setRuta('supervisor_main')}
          onAutorizar={autorizanteHabilitado ? entrarComoAutorizante : undefined}
        />
      );
    case 'autorizante':
      return <Autorizante onVolver={salirDeAutorizante} />;
    case 'supervisor_entry':
      return <SupervisorEntry onNavegar={() => setRuta('supervisor_main')} />;
    case 'supervisor_main':
      return (
        <Supervisor
          onCerrarSesion={() => setRuta('bienvenida')}
          hasDeviceSession={esMiTelefono}
          onCambiarATarja={() =>
            setRuta(sesion.getDeviceToken() && sesion.getSectorActivo() ? 'main' : 'bienvenida')
          }
        />
      );
  }
  }
}
