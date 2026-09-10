/**
 * Equivalentes de los componentes de Compose que usa la app, con las mismas
 * medidas y colores: GradientButton, Card, OutlinedTextField y el dropdown.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { IconoDesplegar } from './iconos';

export function Spinner({ size = 40, color = 'var(--teal)', grosor = 4 }: { size?: number; color?: string; grosor?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: `${grosor}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'staffaxis-giro 900ms linear infinite',
      }}
    />
  );
}

/** GradientButton.kt — alto 56, radio 16, degradé horizontal morado→cyan. */
export function GradientButton({
  text,
  onClick,
  enabled = true,
  isLoading = false,
  gradiente = ['#9c27b0', '#26c6da'],
  style,
}: {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  isLoading?: boolean;
  gradiente?: [string, string] | string[];
  style?: CSSProperties;
}) {
  const activo = enabled && !isLoading;
  return (
    <button
      onClick={onClick}
      disabled={!activo}
      style={{
        height: 56,
        width: '100%',
        border: 'none',
        borderRadius: 16,
        padding: 0,
        color: 'white',
        fontWeight: 700,
        fontSize: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: activo ? `linear-gradient(90deg, ${gradiente[0]}, ${gradiente[1]})` : '#555555',
        cursor: activo ? 'pointer' : 'default',
        ...style,
      }}
    >
      {isLoading ? <Spinner size={24} color="white" grosor={2} /> : text}
    </button>
  );
}

/** Card de Material3 con containerColor #2A2A3E. */
export function Card({
  children,
  radio = 24,
  padding = 24,
  style,
}: {
  children: ReactNode;
  radio?: number;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: '100%',
        background: 'var(--card-background)',
        borderRadius: radio,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const bordeCampo = (foco: boolean, error: boolean) =>
  error ? 'var(--error)' : foco ? '#26c6da' : '#555555';

/**
 * OutlinedTextField de Material3: la etiqueta arranca adentro y sube a
 * "morder" el borde cuando el campo tiene foco o valor, igual que la app.
 */
export function TextField({
  value,
  onChange,
  label,
  placeholder,
  tipo = 'text',
  soloNumeros = false,
  disabled = false,
  error = false,
  iconoIzq,
  multilinea = false,
  fondoEtiqueta = 'var(--card-background)',
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  tipo?: string;
  soloNumeros?: boolean;
  disabled?: boolean;
  error?: boolean;
  iconoIzq?: ReactNode;
  multilinea?: boolean;
  fondoEtiqueta?: string;
  style?: CSSProperties;
}) {
  const [foco, setFoco] = useState(false);
  const arriba = foco || value.length > 0;
  const color = bordeCampo(foco, error);

  return (
    <div style={{ position: 'relative', width: '100%', ...style }}>
      {label && (
        <span
          style={{
            position: 'absolute',
            left: iconoIzq && !arriba ? 44 : 12,
            top: arriba ? -8 : 18,
            padding: arriba ? '0 4px' : 0,
            background: arriba ? fondoEtiqueta : 'transparent',
            fontSize: arriba ? 12 : 16,
            lineHeight: arriba ? '16px' : '20px',
            color: error ? 'var(--error)' : foco ? '#26c6da' : 'var(--texto-tenue)',
            pointerEvents: 'none',
            transition: 'top 120ms, font-size 120ms, left 120ms',
            zIndex: 1,
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: multilinea ? 'flex-start' : 'center',
          gap: 10,
          border: `1px solid ${color}`,
          borderRadius: 12,
          padding: multilinea ? '14px' : '0 14px',
          minHeight: 56,
          background: 'transparent',
        }}
      >
        {iconoIzq}
        {multilinea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFoco(true)}
            onBlur={() => setFoco(false)}
            placeholder={arriba ? placeholder : undefined}
            disabled={disabled}
            rows={2}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: 16,
              fontFamily: 'inherit',
              resize: 'none',
            }}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFoco(true)}
            onBlur={() => setFoco(false)}
            placeholder={label && !arriba ? undefined : placeholder}
            disabled={disabled}
            type={tipo}
            inputMode={soloNumeros ? 'numeric' : undefined}
            pattern={soloNumeros ? '[0-9]*' : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: 16,
              height: 54,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** ExposedDropdownMenuBox — campo de solo lectura que despliega la lista. */
export function Dropdown<T>({
  opciones,
  seleccionado,
  etiqueta,
  placeholder = 'Seleccione un sector',
  iconoIzq,
  onSelect,
}: {
  opciones: T[];
  seleccionado: T | null;
  etiqueta: (o: T) => string;
  placeholder?: string;
  iconoIzq?: ReactNode;
  onSelect: (o: T) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const cont = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  return (
    <div ref={cont} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          height: 56,
          padding: '0 14px',
          border: `1px solid ${bordeCampo(abierto, false)}`,
          background: 'transparent',
          borderRadius: 12,
          color: seleccionado ? 'white' : 'var(--texto-tenue)',
          fontSize: 16,
          textAlign: 'left',
        }}
      >
        {iconoIzq}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {seleccionado ? etiqueta(seleccionado) : placeholder}
        </span>
        <span style={{ color: 'var(--texto-tenue)', display: 'flex', transform: abierto ? 'rotate(180deg)' : undefined }}><IconoDesplegar size={22} /></span>
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--card-background)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 50,
          }}
        >
          {opciones.map((o, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(o);
                setAbierto(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 15,
              }}
            >
              {etiqueta(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
