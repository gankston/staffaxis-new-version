/**
 * MainScreen de Navigation.kt: las 3 solapas con la barra inferior. Los
 * telefonos de los jefes de la cadena de la planilla (Orellana, Marce) tienen
 * una cuarta, "Autorizante" (la decide el servidor: /api/cadena/habilitado).
 */
import { useEffect, useState } from 'react';
import { IconoAusencias, IconoCambiarSector, IconoCheckCirculo, IconoGrupo, IconoLista } from '../components/iconos';
import { api } from '../lib/api';
import { Empleados } from './empleados/Empleados';
import { Ausencias } from './ausencias/Ausencias';
import { Tarja } from './tarja/Tarja';
import { AutorizanteCadena } from './AutorizanteCadena';

type Solapa = 'empleados' | 'ausencias' | 'tarja' | 'autorizante';

const SOLAPAS: Array<{ id: Solapa; label: string; Icono: (p: { size?: number; color?: string }) => JSX.Element }> = [
  { id: 'empleados', label: 'Empleados', Icono: IconoGrupo },
  { id: 'ausencias', label: 'Ausencias', Icono: IconoAusencias },
  { id: 'tarja', label: 'Tarja', Icono: IconoLista },
];
const SOLAPA_AUTORIZANTE = { id: 'autorizante' as const, label: 'Autorizante', Icono: IconoCheckCirculo };

export function Main({
  onCambiarSector,
  onRecargarMain,
  hasSupervisorSession,
  onCambiarASupervisor,
  onAutorizar,
}: {
  onCambiarSector: () => void;
  onRecargarMain: () => void;
  hasSupervisorSession: boolean;
  onCambiarASupervisor: () => void;
  /** Modo autorizante de la Tarja Fuera de Término (solo telefonos habilitados). */
  onAutorizar?: () => void;
}) {
  const [solapa, setSolapa] = useState<Solapa>('empleados');
  // Solapa "Autorizante": solo si el servidor dice que este telefono es de la
  // cadena. Se vuelve a preguntar cada minuto para el numerito de pendientes.
  const [cadena, setCadena] = useState({ habilitado: false, pendientes: 0 });
  useEffect(() => {
    let vivo = true;
    const ver = () =>
      api.cadena
        .habilitado()
        .then((r) => { if (vivo) setCadena(r); })
        .catch(() => { /* sin conexion: queda como estaba */ });
    ver();
    const id = setInterval(ver, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  const solapas = cadena.habilitado ? [...SOLAPAS, SOLAPA_AUTORIZANTE] : SOLAPAS;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dark-background)' }}>
      {onAutorizar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0' }}>
          <button
            onClick={onAutorizar}
            style={{ background: 'rgba(255,183,77,0.12)', border: '1px solid rgba(255,183,77,0.55)', color: '#ffcc80', borderRadius: 10, padding: '5px 12px', fontSize: 13, fontWeight: 600 }}
          >
            Autorizar fuera de término
          </button>
        </div>
      )}
      {hasSupervisorSession && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 4px 0' }}>
          <button
            onClick={onCambiarASupervisor}
            title="Cambiar a modo supervisor"
            style={{ background: 'none', border: 'none', color: 'var(--purple80)', padding: 8, display: 'flex' }}
          >
            <IconoCambiarSector size={22} />
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {solapa === 'empleados' && (
          <Empleados onCambiarSector={onCambiarSector} onRecargarMain={onRecargarMain} />
        )}
        {solapa === 'ausencias' && <Ausencias />}
        {solapa === 'tarja' && (
          <Tarja onCambiarSector={onCambiarSector} onRecargarMain={onRecargarMain} onIrAEmpleados={() => setSolapa('empleados')} />
        )}
        {solapa === 'autorizante' && cadena.habilitado && (
          <AutorizanteCadena onCantidad={(n) => setCadena((c) => ({ ...c, pendientes: n }))} />
        )}
      </div>

      <nav
        style={{
          display: 'flex',
          background: 'var(--bottom-bar)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          flexShrink: 0,
        }}
      >
        {solapas.map((s) => {
          const activa = solapa === s.id;
          const pendientes = s.id === 'autorizante' ? cadena.pendientes : 0;
          return (
            <button
              key={s.id}
              onClick={() => setSolapa(s.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: activa ? 'var(--teal)' : 'var(--texto-apagado)',
                fontWeight: activa ? 700 : 400,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 20px',
                  borderRadius: 12,
                  background: activa ? 'rgba(156,39,176,0.2)' : 'transparent',
                  position: 'relative',
                }}
              >
                <s.Icono size={24} />
                {pendientes > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: 10,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      padding: '0 5px',
                      background: 'var(--error)',
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: '18px',
                      textAlign: 'center',
                    }}
                  >
                    {pendientes}
                  </span>
                )}
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
