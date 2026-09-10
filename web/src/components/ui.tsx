/**
 * Equivalentes de los componentes de Compose que usa la app, con las mismas
 * medidas y colores: GradientButton, Card, OutlinedTextField y el dropdown.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

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

const bordeCampo = (foco: boolean) => (foco ? '#26c6da' : '#555555');
const fondoCampo = (foco: boolean) => (foco ? 'rgba(255,255,255,0.067)' : 'rgba(255,255,255,0.031)');

/** OutlinedTextField con los colores exactos de textFieldColors(). */
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
  style?: CSSProperties;
}) {
  const [foco, setFoco] = useState(false);
  return (
    <label style={{ display: 'block', width: '100%', ...style }}>
      {label && (
        <span style={{ display: 'block', fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 6 }}>{label}</span>
      )}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: `1px solid ${error ? 'var(--error)' : bordeCampo(foco)}`,
          background: fondoCampo(foco),
          borderRadius: 12,
          padding: '0 14px',
          height: 56,
        }}
      >
        {iconoIzq}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          placeholder={placeholder}
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
            height: '100%',
          }}
        />
      </span>
    </label>
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
          border: `1px solid ${bordeCampo(abierto)}`,
          background: fondoCampo(abierto),
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
        <span style={{ color: 'var(--texto-tenue)', transform: abierto ? 'rotate(180deg)' : undefined }}>▾</span>
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
