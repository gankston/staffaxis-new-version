/** Diálogo "cargar horas" — HorasDialog de EmpleadosScreen.kt. */
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/ui';
import { IconoAlerta, IconoCalendario, IconoCheck, IconoDesplegar, IconoGuardar } from '../../components/iconos';
import { FormularioCarga } from './FormularioCarga';
import { puedeGuardar, type ValoresCarga } from './logica';
import { desdeISO, esFechaCargable, fechasCargables, hoyISO, sumarDias } from '../../domain/fechaCarga';
import type { Empleado } from '../../lib/empleados';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function etiquetaFecha(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** "Hoy · lunes 13/10", "Ayer · domingo 12/10", "sábado 11/10". */
function etiquetaOpcion(fecha: string, hoy: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  const dia = `${DIAS[desdeISO(fecha).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (fecha === hoy) return `Hoy · ${dia}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer · ${dia}`;
  return dia;
}

export function DialogoHoras({
  empleado,
  fecha,
  onFecha,
  valores,
  set,
  observaciones,
  onObservaciones,
  tiposCarga,
  sectorId,
  sectorName,
  guardando,
  error,
  onCerrar,
  onGuardar,
}: {
  empleado: Empleado;
  fecha: string;
  onFecha: (f: string) => void;
  valores: ValoresCarga;
  set: (p: Partial<ValoresCarga>) => void;
  observaciones: string;
  onObservaciones: (v: string) => void;
  tiposCarga: string[];
  sectorId: string;
  sectorName: string;
  guardando: boolean;
  error?: string | null;
  onCerrar: () => void;
  onGuardar: () => void;
}) {
  const hoy = hoyISO();
  // Las fechas que puede elegir este sector (OTITO tres dias para atras, el resto
  // hasta ayer), de hoy para atras.
  const opciones = fechasCargables(hoy, sectorId).reverse();
  const [eligiendoFecha, setEligiendoFecha] = useState(false);
  const faltaDni = !empleado.dni?.trim();
  const habilitado = !faltaDni && puedeGuardar(valores) && !guardando;

  return (
    <Modal
      titulo="Registrar Horas"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        {
          texto: error ? 'Reintentar' : 'Guardar',
          onClick: onGuardar,
          habilitado,
          icono: <IconoGuardar size={20} />,
        },
      ]}
    >
      {/* El error se muestra acá adentro, con los datos todavía cargados. */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: 'rgba(255,82,82,0.12)',
            border: '1px solid var(--error)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
          }}
        >
          <span style={{ color: 'var(--error)', display: 'flex', flexShrink: 0 }}>
            <IconoAlerta size={22} />
          </span>
          <div style={{ fontSize: 13, color: 'var(--error)', lineHeight: 1.45 }}>
            <strong>No se pudo guardar.</strong> {error}
            <div style={{ marginTop: 4, color: 'var(--texto-tenue)' }}>
              No se perdió nada: los datos siguen cargados. Fijate la señal y dale Reintentar.
            </div>
          </div>
        </div>
      )}
      {/* Tarjeta con el empleado, igual que la app: nombre grande y el DNI abajo */}
      <div
        style={{
          background: 'rgba(106,27,154,0.55)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: 'white' }}>{empleado.nombre}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
          DNI: {empleado.dni ?? 'Sin datos'}
        </div>
      </div>

      {faltaDni && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(211,47,47,0.12)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <span style={{ color: '#d32f2f', display: 'flex', flexShrink: 0 }}><IconoAlerta size={20} /></span>
          <span style={{ fontSize: 12, color: '#d32f2f', fontWeight: 600 }}>
            Este empleado no tiene DNI cargado. No se pueden registrar horas hasta cargarlo desde "Editar".
          </span>
        </div>
      )}

      {/*
        Selector de fecha propio de la app, sin el calendario del telefono. Antes
        habia un <input type="date"> transparente encima del boton: en algunos
        telefonos (12/10/2026, CAÑADAS ESTRUCTURA y otros) el toque no abria nada,
        porque depende del WebView de cada aparato. Como solo se puede elegir entre
        2 fechas (4 en OTITO), alcanza con una lista que se despliega debajo y anda
        igual en todos.
      */}
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setEligiendoFecha((v) => !v)}
          aria-expanded={eligiendoFecha}
          aria-label={`Fecha: ${etiquetaOpcion(fecha, hoy)}. Tocá para cambiarla`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            height: 48,
            borderRadius: 20,
            border: '1px solid var(--purple80)',
            background: eligiendoFecha ? 'rgba(206,147,216,0.12)' : 'transparent',
            color: 'var(--purple80)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <IconoCalendario size={18} /> {etiquetaFecha(fecha, hoy)}
          <span style={{ display: 'flex', transform: eligiendoFecha ? 'rotate(180deg)' : 'none' }}>
            <IconoDesplegar size={20} />
          </span>
        </button>
        {eligiendoFecha && (
          <div role="listbox" aria-label="Elegí la fecha" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {opciones.map((f) => {
              const elegida = f === fecha;
              return (
                <button
                  key={f}
                  type="button"
                  role="option"
                  aria-selected={elegida}
                  onClick={() => {
                    if (esFechaCargable(f, hoy, sectorId)) onFecha(f);
                    setEligiendoFecha(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minHeight: 46,
                    padding: '0 16px',
                    borderRadius: 14,
                    border: elegida ? '1px solid var(--purple80)' : '1px solid rgba(255,255,255,0.12)',
                    background: elegida ? 'rgba(156,39,176,0.35)' : 'rgba(255,255,255,0.06)',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: elegida ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ textTransform: 'capitalize' }}>{etiquetaOpcion(f, hoy)}</span>
                  {elegida && <IconoCheck size={20} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FormularioCarga valores={valores} set={set} tiposCarga={tiposCarga} sectorId={sectorId} sectorName={sectorName} />

      <div style={{ marginTop: 12 }}>
        <TextField value={observaciones} onChange={onObservaciones} label="Observaciones (opcional)" multilinea />
      </div>
    </Modal>
  );
}
