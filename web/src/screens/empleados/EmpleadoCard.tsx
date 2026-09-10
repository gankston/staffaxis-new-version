/** Port de presentation/components/EmpleadoCard.kt — mismos degradés y badges. */
import type { Empleado } from '../../lib/empleados';

const IconoReloj = ({ color }: { color: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
  </svg>
);

const IconoEditar = ({ color }: { color: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

export function EmpleadoCard({
  empleado,
  tieneHorasHoy,
  estaAusenteHoy,
  onRelojClick,
  onEditarClick,
}: {
  empleado: Empleado;
  tieneHorasHoy: boolean;
  estaAusenteHoy: boolean;
  onRelojClick: () => void;
  onEditarClick: () => void;
}) {
  const gradiente = estaAusenteHoy
    ? ['var(--card-ausente-1)', 'var(--card-ausente-2)']
    : tieneHorasHoy
      ? ['var(--card-con-horas-1)', 'var(--card-con-horas-2)']
      : ['var(--card-normal-1)', 'var(--card-normal-2)'];

  const tintReloj = estaAusenteHoy || tieneHorasHoy ? '#ffffff' : 'var(--turquesa-brillante)';
  const tintEditar = estaAusenteHoy || tieneHorasHoy ? '#ffffff' : 'var(--purple80)';

  const ambas = empleado.tieneFotoFrente && empleado.tieneFotoDorso;
  const alguna = empleado.tieneFotoFrente || empleado.tieneFotoDorso;
  const fotoColor = ambas ? '#4caf50' : alguna ? '#ff9800' : '#ef5350';
  const fotoLabel = ambas ? 'DNI completo' : alguna ? 'DNI parcial' : 'Sin foto DNI';

  // Mismo armado que el Kotlin: "APELLIDO Nombre" cuando se puede separar.
  const displayNombre =
    empleado.apellido.trim() && empleado.nombre.length >= empleado.apellido.length
      ? `${empleado.apellido} ${empleado.nombre.slice(0, empleado.nombre.length - empleado.apellido.length).trim()}`.trim()
      : empleado.nombre;

  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          background: `linear-gradient(90deg, ${gradiente[0]}, ${gradiente[1]})`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="title-large"
            style={{
              fontWeight: 700,
              color: 'white',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayNombre}
          </div>
          <div style={{ height: 6 }} />
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
            DNI: {empleado.dni ?? 'Sin datos'}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
            Sector: {empleado.sectorName}
          </div>

          <div style={{ height: 4 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: fotoColor, display: 'inline-block' }} />
            <span className="label-small" style={{ color: fotoColor, fontWeight: 600 }}>
              {fotoLabel}
            </span>
          </div>

          {empleado.observacion?.trim() ? (
            <>
              <div style={{ height: 2 }} />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                Obs: {empleado.observacion}
              </div>
            </>
          ) : null}

          {estaAusenteHoy && (
            <>
              <div style={{ height: 4 }} />
              <div style={{ fontSize: 12, color: 'white', fontWeight: 700, letterSpacing: 0.5 }}>AUSENTE</div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={onRelojClick}
            disabled={estaAusenteHoy}
            title="Cargar horas"
            style={{
              background: 'none',
              border: 'none',
              padding: 8,
              display: 'flex',
              opacity: estaAusenteHoy ? 0.38 : 1,
              cursor: estaAusenteHoy ? 'default' : 'pointer',
            }}
          >
            <IconoReloj color={tintReloj} />
          </button>
          <button
            onClick={onEditarClick}
            title="Editar"
            style={{ background: 'none', border: 'none', padding: 8, display: 'flex' }}
          >
            <IconoEditar color={tintEditar} />
          </button>
        </div>
      </div>
    </div>
  );
}
