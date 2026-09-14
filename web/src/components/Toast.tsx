/**
 * ConfirmacionFlotante.kt — el cartel de confirmacion de la app.
 *
 * No es un snackbar gris abajo: es una tarjeta grande, verde o roja, en el
 * MEDIO de la pantalla, con icono y dos renglones, y se va sola a los 2
 * segundos. Asi lo conocen los supervisores y asi tiene que verse.
 */
import { useEffect } from 'react';
import { IconoAlerta, IconoCheckCirculo } from './iconos';

export function Toast({
  texto,
  esError,
  onCerrar,
  msVisible = 2000,
}: {
  texto: string;
  esError: boolean;
  onCerrar: () => void;
  msVisible?: number;
}) {
  useEffect(() => {
    const id = setTimeout(onCerrar, msVisible);
    return () => clearTimeout(id);
  }, [texto, esError, onCerrar, msVisible]);

  return (
    <div
      onClick={onCerrar}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 20px',
          borderRadius: 16,
          background: esError ? '#D32F2F' : '#4CAF50',
          color: 'white',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          animation: 'staffaxis-aparece 160ms ease-out',
        }}
      >
        <span style={{ display: 'flex', flexShrink: 0 }}>
          {esError ? <IconoAlerta size={32} /> : <IconoCheckCirculo size={32} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>
            {esError ? 'Error' : '✓ Listo'}
          </div>
          {texto.trim() && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.35, marginTop: 2 }}>
              {texto}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
