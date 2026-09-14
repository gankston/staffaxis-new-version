/** Visualizador de horas del período: grilla empleados × días, como en TarjaScreen.kt. */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/ui';
import { listarRegistros, type Registro } from '../../lib/empleados';
import { parse, sumarValores, CERO } from '../../domain/tarjaValores';
import { sumarLista, TIPOS_NUEVOS_VACIO } from '../../domain/tiposCarga';
import { diasDelPeriodo, fmtAbonada, fmtCantidad, fmtHoras } from './logica';
import { formatMinutesWorkedDisplay, formatTiposNuevosRegistro } from '../empleados/logica';

interface Fila {
  employeeId: string;
  nombre: string;
  apellido: string;
  porDia: Map<string, Registro>;
  totalHoras: number;
  cosechaTotal: number;
  importeTotal: number;
  cajasTotal: number;
  cajonesTotal: number;
}

export function Visualizador({
  sectorId,
  sectorName,
  desde,
  hasta,
  onCerrar,
}: {
  sectorId: string;
  sectorName: string;
  desde: string;
  hasta: string;
  onCerrar: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await listarRegistros({ desde, hasta });
        if (vivo) {
          setRegistros(r);
          setCargando(false);
        }
      } catch (e) {
        if (vivo) {
          setError(`Error al cargar: ${e instanceof Error ? e.message : ''}`);
          setCargando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [desde, hasta, sectorId]);

  const dias = useMemo(() => diasDelPeriodo(desde, hasta), [desde, hasta]);

  const filas = useMemo<Fila[]>(() => {
    const porEmpleado = new Map<string, Registro[]>();
    for (const r of registros) {
      const lista = porEmpleado.get(r.employeeId) ?? [];
      lista.push(r);
      porEmpleado.set(r.employeeId, lista);
    }

    const out: Fila[] = [];
    for (const [empleadoId, subs] of porEmpleado) {
      const primero = subs[0];
      const apellido = (primero.lastName ?? '').trim();
      const soloNombre = (primero.firstName ?? '').trim();
      // Se muestra "APELLIDO Nombre", igual que las tarjetas de Empleados y que
      // el Excel: asi el orden alfabetico por apellido se ve de una.
      const nombre = `${apellido} ${soloNombre}`.trim() || soloNombre;
      if (!nombre) continue;
      const v = subs.reduce((acc, s) => sumarValores(acc, parse(s.minutesWorked)), CERO);
      out.push({
        employeeId: empleadoId,
        nombre,
        apellido,
        porDia: new Map(subs.map((s) => [s.date, s])),
        totalHoras: v.horas,
        cosechaTotal: v.cosecha,
        importeTotal: v.importe,
        cajasTotal: v.cajas,
        cajonesTotal: v.cajones,
      });
    }
    // Orden alfabetico por apellido. Va con locale es e insensible a
    // mayusculas/acentos: sin eso "Ávila" cae despues de "Zarate" y los
    // apellidos en minuscula se van al final.
    const clave = (f: Fila) => (f.apellido || f.nombre).trim();
    return out.sort((a, b) =>
      clave(a).localeCompare(clave(b), 'es', { sensitivity: 'base', numeric: false }),
    );
  }, [registros]);

  const totales = useMemo(() => {
    const v = filas.reduce(
      (acc, f) => ({
        horas: acc.horas + f.totalHoras,
        cosecha: acc.cosecha + f.cosechaTotal,
        importe: acc.importe + f.importeTotal,
        cajas: acc.cajas + f.cajasTotal,
        cajones: acc.cajones + f.cajonesTotal,
      }),
      { horas: 0, cosecha: 0, importe: 0, cajas: 0, cajones: 0 },
    );
    const tipos = sumarLista(registros.map((r) => r.tiposNuevos));
    return { ...v, tipos };
  }, [filas, registros]);

  return (
    <Modal
      titulo={`Horas — ${sectorName}`}
      onCerrar={onCerrar}
      ancho={1100}
      acciones={[{ texto: 'Cerrar', onClick: onCerrar, tipo: 'texto' }]}
    >
      <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 12 }}>
        {desde.split('-').reverse().join('/')} – {hasta.split('-').reverse().join('/')}
      </div>

      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </div>
      ) : error ? (
        <div style={{ color: 'var(--error)', fontSize: 14 }}>{error}</div>
      ) : filas.length === 0 ? (
        <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>No hay horas cargadas en este período.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <Resumen valor={fmtHoras(totales.horas)} label="Total horas" />
            {totales.cosecha > 0 && <Resumen valor={fmtCantidad(totales.cosecha)} label="Cosecha" />}
            {totales.cajas > 0 && <Resumen valor={String(totales.cajas)} label="Cajas" />}
            {totales.cajones > 0 && <Resumen valor={String(totales.cajones)} label="Cajones" />}
            {totales.importe > 0 && <Resumen valor={fmtAbonada(totales.importe)} label="Abonada" />}
            {totales.tipos !== TIPOS_NUEVOS_VACIO && formatTiposNuevosRegistro(totales.tipos) && (
              <Resumen valor={formatTiposNuevosRegistro(totales.tipos)} label="Otros" />
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ ...celda, ...columnaNombre }}>Empleado</th>
                  {dias.map((d) => (
                    <th key={d} style={{ ...celda, minWidth: 54 }}>
                      {d.slice(8)}/{d.slice(5, 7)}
                    </th>
                  ))}
                  <th style={{ ...celda, minWidth: 70 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.employeeId}>
                    <td style={{ ...celda, ...columnaNombre, fontWeight: 600 }} title={f.nombre}>
                      {f.nombre}
                    </td>
                    {dias.map((d) => {
                      const r = f.porDia.get(d);
                      if (!r) return <td key={d} style={{ ...celda, color: 'var(--texto-apagado)' }}>—</td>;
                      const txt = [formatMinutesWorkedDisplay(r.minutesWorked), formatTiposNuevosRegistro(r.tiposNuevos)]
                        .filter((s) => s && s !== '?')
                        .join(' + ');
                      return (
                        <td key={d} style={{ ...celda, color: '#66bb6a', fontWeight: 600 }} title={txt}>
                          {txt}
                        </td>
                      );
                    })}
                    <td style={{ ...celda, fontWeight: 700, color: 'var(--teal)' }}>{fmtHoras(f.totalHoras)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function Resumen({ valor, label }: { valor: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{valor}</div>
      <div className="label-small" style={{ color: 'var(--texto-tenue)' }}>{label}</div>
    </div>
  );
}

/**
 * La columna de nombres queda fija a la izquierda mientras se desplaza el resto.
 * Va con ancho TOPE: sin eso un "PUNTA ORMACHEA PABLO GASTON" estiraba la
 * columna hasta ocupar toda la pantalla y las horas quedaban afuera, sin que se
 * viera un solo dato. El nombre se parte en dos renglones antes que recortarse:
 * en una planilla de sueldos el nombre completo tiene que leerse.
 */
const columnaNombre: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--card-background)',
  textAlign: 'left',
  width: 132,
  minWidth: 132,
  maxWidth: 132,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.2,
};

const celda: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '6px 8px',
  textAlign: 'center',
};
