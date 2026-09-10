/** Clon de AusenciasScreen.kt + su ViewModel: calendario del mes, alta y listado. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Dropdown, Spinner, TextField } from '../../components/ui';
import { Toast } from '../../components/Toast';
import { api } from '../../lib/api';
import { listarEmpleados, type Empleado } from '../../lib/empleados';
import { sesion } from '../../lib/session';
import { aISO, hoyISO } from '../../domain/fechaCarga';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Ausencia {
  id: string;
  employeeId: string;
  employeeName: string;
  fechaInicio: string;
  fechaFin: string;
  certificadoMedico: boolean;
  observaciones: string | null;
}

const ddmm = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};
const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function Ausencias() {
  const sector = sesion.getSectorActivo();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [certificado, setCertificado] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = hoyISO();
  const ahora = new Date();
  const [anio, mes] = [ahora.getFullYear(), ahora.getMonth()];

  const cargar = useCallback(async () => {
    if (!sector) return;
    setCargando(true);
    try {
      const [emps, aus] = await Promise.all([
        listarEmpleados(sector.id, sector.name),
        api.getAusencias(),
      ]);
      setEmpleados(emps);
      const porId = new Map(emps.map((e) => [e.id, e.nombre]));
      setAusencias(
        (aus.absences ?? []).map((a) => ({
          id: a.id,
          employeeId: a.employee_id,
          employeeName: porId.get(a.employee_id) ?? '',
          fechaInicio: a.start_date.slice(0, 10),
          fechaFin: a.end_date.slice(0, 10),
          certificadoMedico: !!a.is_justified,
          observaciones: a.observations,
        })),
      );
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error al cargar', esError: true });
    }
    setCargando(false);
  }, [sector]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Dias del mes marcados en rojo: solo las ausencias con certificado medico.
  const diasConAusencia = useMemo(() => {
    const set = new Set<string>();
    for (const a of ausencias.filter((x) => x.certificadoMedico)) {
      const d = new Date(a.fechaInicio + 'T00:00:00');
      const fin = new Date(a.fechaFin + 'T00:00:00');
      while (d <= fin) {
        if (d.getFullYear() === anio && d.getMonth() === mes) set.add(aISO(d));
        d.setDate(d.getDate() + 1);
      }
    }
    return set;
  }, [ausencias, anio, mes]);

  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const offsetInicio = new Date(anio, mes, 1).getDay();

  const guardar = async () => {
    if (!empleado || !fechaInicio || !fechaFin) return;
    setGuardando(true);
    try {
      await api.crearAusencia({
        employee_id: empleado.id,
        start_date: fechaInicio,
        end_date: fechaFin,
        is_justified: certificado,
        observations: observaciones.trim() || null,
      });
      setMostrarForm(false);
      setEmpleado(null);
      setFechaInicio('');
      setFechaFin('');
      setCertificado(false);
      setObservaciones('');
      setMensaje({ texto: 'Ausencia registrada', esError: false });
      cargar();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
    }
    setGuardando(false);
  };

  if (!sector) return null;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'white' }}>Ausencias</div>
          <div style={{ height: 4 }} />
          <div style={{ fontSize: 16, color: 'var(--teal)' }}>
            {MESES[mes]} {anio}
          </div>
        </div>

        <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {DIAS.map((d) => (
              <div key={d} className="label-small" style={{ textAlign: 'center', color: 'var(--texto-tenue)', fontWeight: 700 }}>
                {d}
              </div>
            ))}
            {Array.from({ length: offsetInicio }).map((_, i) => (
              <div key={`v${i}`} style={{ height: 34 }} />
            ))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const fecha = aISO(new Date(anio, mes, i + 1));
              const ausente = diasConAusencia.has(fecha);
              const esHoy = fecha === hoy;
              return (
                <div
                  key={fecha}
                  style={{
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'white',
                    background: ausente
                      ? 'rgba(255,82,82,0.8)'
                      : esHoy
                        ? 'rgba(156,39,176,0.6)'
                        : 'transparent',
                  }}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>

          <div style={{ height: 8 }} />
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5252' }} />
              <span className="label-small" style={{ color: 'var(--texto-tenue)' }}>Ausente (c/cert.)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#9c27b0' }} />
              <span className="label-small" style={{ color: 'var(--texto-tenue)' }}>Hoy</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setMostrarForm(true)}
          style={{
            width: '100%',
            padding: 14,
            border: 'none',
            borderRadius: 12,
            background: 'linear-gradient(90deg, #9c27b0, #26c6da)',
            color: 'white',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          + Registrar ausencia
        </button>

        {cargando && ausencias.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        ) : ausencias.length > 0 ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Ausencias registradas</div>
            {ausencias.slice(0, 20).map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--card-background)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'white' }}>{a.employeeName}</div>
                  <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
                    {ddmm(a.fechaInicio)} → {ddmm(a.fechaFin)}
                  </div>
                </div>
                {a.certificadoMedico && (
                  <span
                    className="label-small"
                    style={{
                      background: 'rgba(255,82,82,0.2)',
                      color: '#ff5252',
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    Cert. médico
                  </span>
                )}
              </div>
            ))}
          </>
        ) : null}
      </div>

      {mostrarForm && (
        <Modal
          titulo="Registrar Ausencia"
          onCerrar={() => setMostrarForm(false)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setMostrarForm(false), tipo: 'texto' },
            {
              texto: 'Guardar',
              onClick: guardar,
              habilitado: !!empleado && !!fechaInicio && !!fechaFin,
              cargando: guardando,
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Dropdown
              opciones={empleados}
              seleccionado={empleado}
              etiqueta={(e) => `${e.nombre} - ${e.dni ?? ''}`}
              placeholder="Empleado"
              onSelect={setEmpleado}
            />
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 6 }}>
                Fecha inicio {fechaInicio && `(${ddmmyyyy(fechaInicio)})`}
              </span>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                style={campoFecha}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 6 }}>
                Fecha fin {fechaFin && `(${ddmmyyyy(fechaFin)})`}
              </span>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={campoFecha} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={certificado}
                onChange={(e) => setCertificado(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--purple80)' }}
              />
              Certificado médico (marca rojo en calendario)
            </label>

            <TextField value={observaciones} onChange={setObservaciones} label="Observaciones" />
          </div>
        </Modal>
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}
    </div>
  );
}

const campoFecha: React.CSSProperties = {
  width: '100%',
  height: 56,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid #555555',
  background: 'rgba(255,255,255,0.031)',
  color: 'white',
  fontSize: 16,
  colorScheme: 'dark',
};
