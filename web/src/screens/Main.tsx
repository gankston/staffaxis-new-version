/** MainScreen de Navigation.kt: las 3 solapas con la barra inferior. */
import { useState } from 'react';
import { IconoAusencias, IconoCambiarSector, IconoGrupo, IconoLista } from '../components/iconos';
import { Empleados } from './empleados/Empleados';
import { Ausencias } from './ausencias/Ausencias';
import { Tarja } from './tarja/Tarja';

type Solapa = 'empleados' | 'ausencias' | 'tarja';

const SOLAPAS: Array<{ id: Solapa; label: string; Icono: (p: { size?: number; color?: string }) => JSX.Element }> = [
  { id: 'empleados', label: 'Empleados', Icono: IconoGrupo },
  { id: 'ausencias', label: 'Ausencias', Icono: IconoAusencias },
  { id: 'tarja', label: 'Tarja', Icono: IconoLista },
];

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
      </div>

      <nav
        style={{
          display: 'flex',
          background: 'var(--bottom-bar)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          flexShrink: 0,
        }}
      >
        {SOLAPAS.map((s) => {
          const activa = solapa === s.id;
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
                }}
              >
                <s.Icono size={24} />
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
