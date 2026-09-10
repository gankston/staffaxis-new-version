/** Clon de SupervisorEntryScreen.kt + su ViewModel: elegir supervisor y pedir acceso. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Dropdown, GradientButton, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { getDeviceId, getPhoneModel, getUbicacion } from '../lib/bridge';
import { sesion } from '../lib/session';
import logoUrl from '../assets/logo_staffaxis.png';

interface SupervisorInfo {
  id: string;
  full_name: string;
}

export function SupervisorEntry({ onNavegar }: { onNavegar: () => void }) {
  const [chequeando, setChequeando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [supervisores, setSupervisores] = useState<SupervisorInfo[]>([]);
  const [seleccionado, setSeleccionado] = useState<SupervisorInfo | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [rechazado, setRechazado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const polling = useRef<number | null>(null);
  const detener = () => {
    if (polling.current !== null) {
      clearInterval(polling.current);
      polling.current = null;
    }
  };
  useEffect(() => detener, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (sesion.getSupervisorToken()) {
        if (vivo) {
          setChequeando(false);
          onNavegar();
        }
        return;
      }
      try {
        const r = await api.listarSupervisores();
        if (vivo) {
          setSupervisores(r.supervisors ?? []);
          setChequeando(false);
        }
      } catch (e) {
        if (vivo) {
          setError(e instanceof Error ? e.message : 'Error');
          setChequeando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esperarAutorizacion = useCallback(
    (requestId: string, sup: SupervisorInfo) => {
      detener();
      polling.current = window.setInterval(async () => {
        try {
          const r = await api.estadoAccesoSupervisor(requestId);
          if (r.status === 'authorized' && r.token) {
            detener();
            sesion.guardarSupervisor(r.token, sup.id, sup.full_name);
            setEsperando(false);
            onNavegar();
          } else if (r.status === 'rejected') {
            detener();
            setEsperando(false);
            setRechazado(true);
          }
        } catch {
          /* error de red puntual: reintenta en el próximo ciclo */
        }
      }, 3000);
    },
    [onNavegar],
  );

  const solicitar = async () => {
    if (!seleccionado) return;
    setCargando(true);
    setError(null);
    try {
      const ubicacion = await getUbicacion();
      const r = await api.pedirAccesoSupervisor({
        device_id: getDeviceId(),
        supervisor_id: seleccionado.id,
        phone_model: getPhoneModel(),
        latitude: ubicacion?.latitude ?? null,
        longitude: ubicacion?.longitude ?? null,
      });
      setCargando(false);
      if (r.status === 'authorized' && r.token) {
        sesion.guardarSupervisor(r.token, seleccionado.id, seleccionado.full_name);
        onNavegar();
      } else if (r.status === 'pending' && r.request_id) {
        setEsperando(true);
        esperarAutorizacion(r.request_id, seleccionado);
      }
    } catch (e) {
      setCargando(false);
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const cancelar = () => {
    detener();
    setEsperando(false);
    setRechazado(false);
    setSeleccionado(null);
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
      <img src={logoUrl} alt="Logo" width={100} height={100} style={{ objectFit: 'contain' }} />
      <div style={{ height: 20 }} />
      <h1 style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 24, textAlign: 'center' }}>
        Modo supervisor
      </h1>
      <div style={{ height: 36 }} />

      {rechazado ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 40, color: 'var(--error)', lineHeight: 1 }}>✕</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Solicitud rechazada</div>
            <div style={{ color: '#b0b0b0', fontSize: 14, textAlign: 'center' }}>
              El administrador rechazó el acceso. Si es un error, pedile que revise la solicitud.
            </div>
            <GradientButton text="Volver a intentar" onClick={cancelar} />
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
      ) : (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>Elegí tu nombre</div>
            <Dropdown
              opciones={supervisores}
              seleccionado={seleccionado}
              etiqueta={(s) => s.full_name}
              placeholder="Seleccioná un supervisor"
              onSelect={setSeleccionado}
            />
            <GradientButton
              text={cargando ? 'Solicitando...' : 'Solicitar autorización'}
              onClick={solicitar}
              enabled={!!seleccionado}
              isLoading={cargando}
            />
          </div>
        </Card>
      )}

      {error && (
        <>
          <div style={{ height: 16 }} />
          <div style={{ color: 'var(--error)', fontSize: 14, textAlign: 'center' }}>{error}</div>
        </>
      )}
    </div>
  );
}
