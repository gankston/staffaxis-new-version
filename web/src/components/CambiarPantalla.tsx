/**
 * Selector de pantalla SOLO para el telefono de Gaston (MI_TELEFONO_DEVICE_ID en
 * App.tsx): pasa entre encargado, supervisor y autorizante sin cerrar ninguna
 * sesion ni borrar datos de la app. A los demas telefonos no les aparece.
 */
import { useState } from 'react';

export type Pantalla = 'main' | 'supervisor_main' | 'autorizante';

export function CambiarPantalla({
  actual,
  opciones,
  onElegir,
}: {
  actual: string;
  opciones: Array<{ id: Pantalla; texto: string }>;
  onElegir: (p: Pantalla) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  if (opciones.length < 2) return null;
  return (
    <div style={{ position: 'fixed', left: 10, bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 50 }}>
      {abierto && (
        <div
          style={{
            marginBottom: 6,
            background: 'var(--card-background)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            minWidth: 170,
          }}
        >
          {opciones.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setAbierto(false);
                if (o.id !== actual) onElegir(o.id);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                background: o.id === actual ? 'rgba(156,39,176,0.3)' : 'transparent',
                border: 'none',
                color: o.id === actual ? 'var(--teal)' : 'white',
                fontSize: 14,
                fontWeight: o.id === actual ? 700 : 500,
              }}
            >
              {o.texto}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setAbierto((v) => !v)}
        style={{
          padding: '7px 12px',
          borderRadius: 16,
          border: '1px solid var(--purple80)',
          background: 'rgba(30,30,46,0.92)',
          color: 'var(--purple80)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Cambiar de pantalla
      </button>
    </div>
  );
}
