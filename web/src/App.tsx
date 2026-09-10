import { useCallback, useEffect, useRef, useState } from 'react';
import { alRevocarse, api } from './lib/api';
import { sesion } from './lib/session';
import { getDeviceId } from './lib/bridge';
import { SinConexion } from './screens/SinConexion';
import { Bienvenida } from './screens/Bienvenida';
import { Main } from './screens/Main';
import { SupervisorEntry } from './screens/SupervisorEntry';
import { Supervisor } from './screens/Supervisor';

/** Espejo de Navigation.kt — mismas rutas y mismas transiciones. */
export type Ruta = 'bienvenida' | 'main' | 'supervisor_entry' | 'supervisor_main';

// El boton para saltar entre modo tarja y modo supervisor existe SOLO en el
// telefono de Gaston (mismo device_id fijo que en SessionViewModel.kt).
const MI_TELEFONO_DEVICE_ID = 'fbb9b66cbf60a6e7';

function destinoInicial(): Ruta {
  const token = sesion.getDeviceToken();
  const sector = sesion.getSectorActivo();
  if (token && sector) return 'main';
  if (sesion.getSupervisorToken()) return 'supervisor_main';
  return 'bienvenida';
}

export function App() {
  const [ruta, setRuta] = useState<Ruta>(() => destinoInicial());
  const [sinConexion, setSinConexion] = useState(() => !navigator.onLine);
  const [recargas, setRecargas] = useState(0);
  const esMiTelefono = useRef(getDeviceId() === MI_TELEFONO_DEVICE_ID).current;

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
    const id = setInterval(async () => {
      if (!sesion.getDeviceToken()) return;
      try {
        const r = await api.estadoDispositivo();
        if (r?.is_master !== null && r?.is_master !== undefined) sesion.guardarMaestro(r.is_master);
      } catch {
        /* sin conexion: el interceptor ya maneja la revocacion real */
      }
    }, 25_000);
    return () => clearInterval(id);
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

  if (sinConexion) return <SinConexion onReintentar={() => setSinConexion(!navigator.onLine)} />;

  switch (ruta) {
    case 'bienvenida':
      return (
        <Bienvenida
          onNavegar={() => setRuta('main')}
          onEntrarComoSupervisor={() => setRuta('supervisor_entry')}
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
        />
      );
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
