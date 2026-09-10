/**
 * Clon de presentation/screens/bienvenida/ (Screen + ViewModel).
 * Mismo flujo: chequeo inicial, elegir sector, pedir autorizacion, polling cada
 * 3s, pantalla de rechazo, y el acceso discreto al modo supervisor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Dropdown, GradientButton, Spinner, TextField } from '../components/ui';
import {
  consultarEstadoAcceso,
  fetchSectoresPublicos,
  getSectoresPermitidos,
  guardarSectorActivo,
  solicitarAcceso,
  type Sector,
} from '../lib/auth';
import { sesion } from '../lib/session';
import logoUrl from '../assets/logo_staffaxis.png';

const etiquetaConEncargado = (s: Sector) => (s.encargado?.trim() ? `${s.encargado} — ${s.name}` : s.name);

const IconoSector = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--teal)" aria-hidden>
    <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />
  </svg>
);

export function Bienvenida({
  onNavegar,
  onEntrarComoSupervisor,
}: {
  onNavegar: () => void;
  onEntrarComoSupervisor: () => void;
}) {
  const [chequeando, setChequeando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [tieneToken, setTieneToken] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [sectorSeleccionado, setSectorSeleccionado] = useState<Sector | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [esperando, setEsperando] = useState(false);
  const [rechazado, setRechazado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const polling = useRef<number | null>(null);
  const detenerPolling = () => {
    if (polling.current !== null) {
      clearInterval(polling.current);
      polling.current = null;
    }
  };
  useEffect(() => detenerPolling, []);

  // checkRegistration() del ViewModel, con el mismo timeout de seguridad de 5s.
  useEffect(() => {
    let vivo = true;
    const guarda = setTimeout(() => {
      if (vivo) {
        setChequeando(false);
        setCargando(false);
      }
    }, 5000);

    (async () => {
      const token = sesion.getDeviceToken();
      if (!token) {
        if (vivo) setChequeando(false);
        clearTimeout(guarda);
        return;
      }
      if (sesion.getSectorActivo()) {
        clearTimeout(guarda);
        if (vivo) {
          setChequeando(false);
          onNavegar();
        }
        return;
      }
      if (vivo) {
        setChequeando(false);
        setCargando(true);
        setTieneToken(true);
      }
      try {
        const permitidos = await getSectoresPermitidos();
        clearTimeout(guarda);
        if (!vivo) return;
        if (permitidos.length === 1) {
          guardarSectorActivo(permitidos[0]);
          setCargando(false);
          onNavegar();
        } else {
          setCargando(false);
          setMostrarFormulario(true);
          setSectores(permitidos);
        }
      } catch (e) {
        clearTimeout(guarda);
        if (!vivo) return;
        setCargando(false);
        setError(e instanceof Error ? e.message : 'Error');
      }
    })();

    return () => {
      vivo = false;
      clearTimeout(guarda);
    };
    // Igual que el ViewModel: corre una sola vez al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mostrarFormularioRegistro = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const s = await fetchSectoresPublicos();
      setCargando(false);
      setMostrarFormulario(true);
      setSectores(s);
    } catch (e) {
      setCargando(false);
      setError(`No se pudieron cargar los sectores: ${e instanceof Error ? e.message : 'error'}`);
    }
  }, []);

  const esperarAutorizacion = useCallback(
    (requestId: string, sector: Sector) => {
      detenerPolling();
      polling.current = window.setInterval(async () => {
        try {
          const estado = await consultarEstadoAcceso(requestId);
          if (estado.tipo === 'authorized') {
            detenerPolling();
            guardarSectorActivo(sector);
            setEsperando(false);
            onNavegar();
          } else if (estado.tipo === 'rejected') {
            detenerPolling();
            setEsperando(false);
            setRechazado(true);
          }
        } catch {
          /* error de red puntual: reintenta en el proximo ciclo */
        }
      }, 3000);
    },
    [onNavegar],
  );

  const solicitarAutorizacion = useCallback(async () => {
    const sector = sectorSeleccionado;
    const nombre = nombreCompleto.trim();
    if (!sector || !nombre) return;

    setCargando(true);
    setError(null);
    try {
      const r = await solicitarAcceso(sector, nombre);
      if (r.tipo === 'authorized') {
        guardarSectorActivo(sector);
        setCargando(false);
        onNavegar();
      } else {
        setCargando(false);
        setEsperando(true);
        esperarAutorizacion(r.requestId, sector);
      }
    } catch (e) {
      setCargando(false);
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, [sectorSeleccionado, nombreCompleto, onNavegar, esperarAutorizacion]);

  const cancelarEspera = () => {
    detenerPolling();
    setEsperando(false);
    setRechazado(false);
    setSectorSeleccionado(null);
    setNombreCompleto('');
  };

  const confirmarSector = () => {
    if (!sectorSeleccionado) return;
    guardarSectorActivo(sectorSeleccionado);
    onNavegar();
  };

  if (chequeando) return <div style={{ height: '100%', background: 'var(--dark-background)' }} />;

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'linear-gradient(180deg, #6a1b9a 0%, #4a148c 50%, #1e1e2e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        overflowY: 'auto',
      }}
    >
      <img src={logoUrl} alt="Logo" width={120} height={120} style={{ objectFit: 'contain' }} />
      <div style={{ height: 24 }} />
      <h1
        style={{
          margin: 0,
          color: 'white',
          fontWeight: 700,
          fontSize: 26,
          textAlign: 'center',
          lineHeight: 1.25,
        }}
      >
        Bienvenido a StaffAxis HSM
      </h1>
      <div style={{ height: 48 }} />

      {rechazado ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 40, color: 'var(--error)', lineHeight: 1 }}>✕</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Solicitud rechazada</div>
            <div style={{ color: '#b0b0b0', fontSize: 14, textAlign: 'center' }}>
              El administrador rechazó el acceso. Si es un error, pedile que revise la solicitud.
            </div>
            <div style={{ height: 4 }} />
            <GradientButton text="Volver a intentar" onClick={cancelarEspera} />
          </div>
        </Card>
      ) : esperando ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Spinner />
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Esperando autorización</div>
            <div style={{ color: '#b0b0b0', fontSize: 14, textAlign: 'center' }}>
              Tu solicitud ya llegó al administrador. Esta pantalla va a avanzar sola apenas te autoricen.
            </div>
          </div>
        </Card>
      ) : cargando ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Spinner />
          <div style={{ height: 16 }} />
          <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>Cargando...</div>
        </div>
      ) : tieneToken && mostrarFormulario && sectores.length > 0 ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>Seleccione el Sector</div>
            <Dropdown
              opciones={sectores}
              seleccionado={sectorSeleccionado}
              etiqueta={(s) => s.name}
              iconoIzq={<IconoSector />}
              onSelect={setSectorSeleccionado}
            />
            <GradientButton text="Continuar" onClick={confirmarSector} enabled={!!sectorSeleccionado} />
          </div>
        </Card>
      ) : !tieneToken && mostrarFormulario && sectores.length > 0 ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>Seleccione el Sector</div>
            <Dropdown
              opciones={sectores}
              seleccionado={sectorSeleccionado}
              etiqueta={etiquetaConEncargado}
              iconoIzq={<IconoSector />}
              onSelect={setSectorSeleccionado}
            />
            <TextField value={nombreCompleto} onChange={setNombreCompleto} label="Nombre y apellido" />
            <GradientButton
              text={cargando ? 'Solicitando...' : 'Solicitar autorización'}
              onClick={solicitarAutorizacion}
              enabled={!!sectorSeleccionado && nombreCompleto.trim().length > 0}
              isLoading={cargando}
            />
          </div>
        </Card>
      ) : !tieneToken && mostrarFormulario && sectores.length === 0 ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Sin sectores disponibles</div>
            <div style={{ color: '#b0b0b0', fontSize: 14, textAlign: 'center' }}>
              No hay sectores configurados en el servidor. Contactá al administrador.
            </div>
          </div>
        </Card>
      ) : (
        <GradientButton text="Continuar" onClick={mostrarFormularioRegistro} />
      )}

      {error && (
        <>
          <div style={{ height: 16 }} />
          <div style={{ color: 'var(--error)', fontSize: 14, textAlign: 'center' }}>{error}</div>
        </>
      )}

      {!esperando && !rechazado && (
        <>
          <div style={{ height: 28 }} />
          <button
            onClick={onEntrarComoSupervisor}
            style={{ background: 'none', border: 'none', color: 'var(--texto-tenue)', fontSize: 14 }}
          >
            Entrar como supervisor
          </button>
        </>
      )}
    </div>
  );
}
