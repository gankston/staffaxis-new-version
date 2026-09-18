/** Diálogo "cargar horas" — HorasDialog de EmpleadosScreen.kt. */
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/ui';
import { IconoAlerta, IconoCalendario, IconoGuardar } from '../../components/iconos';
import { FormularioCarga } from './FormularioCarga';
import { puedeGuardar, type ValoresCarga } from './logica';
import { diasAtras, esFechaCargable, hoyISO, sumarDias } from '../../domain/fechaCarga';
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
  guardando: boolean;
  error?: string | null;
  onCerrar: () => void;
  onGuardar: () => void;
}) {
  const hoy = hoyISO();
  // Desde que fecha puede cargar este sector (OTITO tres dias, el resto ayer).
  const masViejo = sumarDias(hoy, -diasAtras(sectorId));
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
        Calendario nativo, igual que el DatePickerDialog de la app. Antes era una
        fila de botones: con dos fechas entraba, pero apenas el sector permitio
        tres los botones se salian de la pantalla y quedaban cortados.

        El <input type="date"> va transparente ENCIMA del boton en vez de oculto:
        asi el toque le llega a el y abre el calendario del telefono. Con el input
        escondido hay WebViews donde no abre nada.
      */}
      <div style={{ position: 'relative', width: '100%', height: 48, marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            height: '100%',
            borderRadius: 20,
            border: '1px solid var(--purple80)',
            color: 'var(--purple80)',
            fontSize: 14,
          }}
        >
          <IconoCalendario size={18} /> {etiquetaFecha(fecha, hoy)}
        </div>
        <input
          type="date"
          value={fecha}
          min={masViejo}
          max={hoy}
          onChange={(e) => {
            const f = e.target.value;
            // El min/max del navegador ya lo limita, pero se revalida por las dudas:
            // en un teclado se puede escribir cualquier cosa.
            if (f && esFechaCargable(f, hoy, sectorId)) onFecha(f);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            border: 'none',
            background: 'transparent',
          }}
        />
      </div>

      <FormularioCarga valores={valores} set={set} tiposCarga={tiposCarga} sectorId={sectorId} />

      <div style={{ marginTop: 12 }}>
        <TextField value={observaciones} onChange={onObservaciones} label="Observaciones (opcional)" multilinea />
      </div>
    </Modal>
  );
}
