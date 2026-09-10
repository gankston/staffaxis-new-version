/** AlertDialog de Material3: fondo #2A2A3E, radio 28, acciones abajo a la derecha. */
import type { ReactNode } from 'react';
import { Spinner } from './ui';

export interface AccionModal {
  texto: string;
  onClick: () => void;
  habilitado?: boolean;
  tipo?: 'boton' | 'texto';
  cargando?: boolean;
  peligro?: boolean;
  icono?: ReactNode;
}

export function Modal({
  titulo,
  icono,
  children,
  acciones = [],
  onCerrar,
  ancho = 520,
}: {
  titulo?: string;
  icono?: ReactNode;
  children?: ReactNode;
  acciones?: AccionModal[];
  onCerrar?: () => void;
  ancho?: number;
}) {
  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: ancho,
          maxHeight: 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-background)',
          borderRadius: 28,
          padding: 24,
        }}
      >
        {icono && <div style={{ textAlign: 'center', marginBottom: 8 }}>{icono}</div>}
        {titulo && (
          <div className="title-large" style={{ fontWeight: 700, color: 'white', marginBottom: 16 }}>
            {titulo}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>{children}</div>

        {acciones.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            {acciones.map((a, i) => {
              const activo = a.habilitado !== false && !a.cargando;
              const color = a.peligro ? 'var(--error)' : 'var(--purple80)';
              return (
                <button
                  key={i}
                  onClick={a.onClick}
                  disabled={!activo}
                  style={{
                    minWidth: 88,
                    height: 40,
                    padding: '0 20px',
                    borderRadius: 20,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: a.tipo === 'texto' ? 'transparent' : activo ? color : '#555555',
                    color: a.tipo === 'texto' ? (activo ? color : '#777') : 'white',
                    cursor: activo ? 'pointer' : 'default',
                  }}
                >
                  {a.cargando ? (
                    <Spinner size={16} color="white" grosor={2} />
                  ) : (
                    <>
                      {a.icono}
                      {a.texto}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
