/** Diálogo "cargar horas" — HorasDialog de EmpleadosScreen.kt. */
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/ui';
import { IconoAlerta, IconoCalendario, IconoGuardar } from '../../components/iconos';
import { FormularioCarga } from './FormularioCarga';
import { puedeGuardar, type ValoresCarga } from './logica';
import { esFechaCargable, hoyISO, sumarDias } from '../../domain/fechaCarga';
import type { Empleado } from '../../lib/empleados';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function etiquetaFecha(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
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
  guardando,
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
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: () => void;
}) {
  const hoy = hoyISO();
  const [verSelector, setVerSelector] = useState(false);
  const faltaDni = !empleado.dni?.trim();
  const habilitado = !faltaDni && puedeGuardar(valores) && !guardando;

  return (
    <Modal
      titulo="Registrar Horas"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        { texto: 'Guardar', onClick: onGuardar, habilitado, icono: <IconoGuardar size={20} /> },
      ]}
    >
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

      {/* Solo se puede cargar hoy o ayer — esFechaCargable(). */}
      <button
        onClick={() => setVerSelector((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          height: 48,
          borderRadius: 20,
          border: '1px solid var(--purple80)',
          background: 'transparent',
          color: 'var(--purple80)',
          fontSize: 14,
          marginBottom: 12,
        }}
      >
        <IconoCalendario size={18} /> {etiquetaFecha(fecha, hoy)}
      </button>

      {verSelector && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[sumarDias(hoy, -1), hoy].map((f) => (
            <button
              key={f}
              disabled={!esFechaCargable(f, hoy)}
              onClick={() => {
                onFecha(f);
                setVerSelector(false);
              }}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${f === fecha ? 'var(--teal)' : '#555'}`,
                background: f === fecha ? 'rgba(38,198,218,0.12)' : 'transparent',
                color: f === fecha ? 'var(--teal)' : 'white',
              }}
            >
              {etiquetaFecha(f, hoy)}
            </button>
          ))}
        </div>
      )}

      <FormularioCarga valores={valores} set={set} tiposCarga={tiposCarga} sectorId={sectorId} />

      <div style={{ marginTop: 12 }}>
        <TextField value={observaciones} onChange={onObservaciones} label="Observaciones (opcional)" multilinea />
      </div>
    </Modal>
  );
}
