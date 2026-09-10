/** Snackbar de mensajes (mensajeExito / mensajeError del ViewModel). */
import { useEffect } from 'react';

export function Toast({
  texto,
  esError,
  onCerrar,
}: {
  texto: string;
  esError: boolean;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onCerrar, 4000);
    return () => clearTimeout(id);
  }, [texto, onCerrar]);

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 88,
        zIndex: 200,
        background: esError ? 'var(--error)' : '#323232',
        color: 'white',
        borderRadius: 8,
        padding: '14px 16px',
        fontSize: 14,
        boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
      }}
    >
      {texto}
    </div>
  );
}
