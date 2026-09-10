/** MainScreen de Navigation.kt: las 3 solapas con la barra inferior. */
import { useState } from 'react';
import { Empleados } from './empleados/Empleados';
import { Ausencias } from './ausencias/Ausencias';
import { Tarja } from './tarja/Tarja';

type Solapa = 'empleados' | 'ausencias' | 'tarja';

const SOLAPAS: Array<{ id: Solapa; label: string; icono: string }> = [
  { id: 'empleados', label: 'Empleados', icono: '👥' },
  { id: 'ausencias', label: 'Ausencias', icono: '🚫' },
  { id: 'tarja', label: 'Tarja', icono: '☰' },
];

export function Main({
  onCambiarSector,
  onRecargarMain,
  hasSupervisorSession,
  onCambiarASupervisor,
}: {
  onCambiarSector: () => void;
  onRecargarMain: () => void;
  hasSupervisorSession: boolean;
  onCambiarASupervisor: () => void;
}) {
  const [solapa, setSolapa] = useState<Solapa>('empleados');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dark-background)' }}>
      {hasSupervisorSession && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 4px 0' }}>
          <button
            onClick={onCambiarASupervisor}
            title="Cambiar a modo supervisor"
            style={{ background: 'none', border: 'none', color: 'var(--purple80)', fontSize: 22, padding: 8 }}
          >
            ⇅
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {solapa === 'empleados' && (
          <Empleados onCambiarSector={onCambiarSector} onRecargarMain={onRecargarMain} />
        )}
        {solapa === 'ausencias' && <Ausencias />}
        {solapa === 'tarja' && <Tarja onCambiarSector={onCambiarSector} onRecargarMain={onRecargarMain} />}
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
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '2px 16px',
                  borderRadius: 12,
                  background: activa ? 'rgba(156,39,176,0.2)' : 'transparent',
                }}
              >
                {s.icono}
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
