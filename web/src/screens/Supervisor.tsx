/**
 * Clon de SupervisorScreen.kt + su ViewModel: carteles por sector/día, detalle
 * empleado por empleado con buscador y filtro, aprobar/rechazar, y el resumen
 * del período (21→20).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Spinner, TextField } from '../components/ui';
import { Toast } from '../components/Toast';
import {
  IconoAnterior,
  IconoCambiarSector,
  IconoGrafico,
  IconoSalir,
  IconoSiguiente,
} from '../components/iconos';
import { api, type SupervisorResumenRowDto } from '../lib/api';
import { sesion } from '../lib/session';
import {
  agruparEnTarjasDelDia,
  filtrosDeSector,
  lineasDeTotales,
  tieneDato,
  type TarjaDelDia,
  type TipoCargaFiltro,
} from '../domain/supervisorTarjaDia';
import { formatMinutesWorkedDisplay, formatTiposNuevosRegistro } from './empleados/logica';
import { calcularPeriodo, fmtHoras } from './tarja/logica';
import { hoyISO } from '../domain/fechaCarga';
import { sumar } from '../domain/tarjaValores';

const fechaLegible = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function Supervisor({
  onCerrarSesion,
  hasDeviceSession,
  onCambiarATarja,
}: {
  onCerrarSesion: () => void;
  hasDeviceSession: boolean;
  onCambiarATarja: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [sectores, setSectores] = useState<string[]>([]);
  const [tarjas, setTarjas] = useState<TarjaDelDia[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [procesando, setProcesando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<TipoCargaFiltro | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const [periodoOffset, setPeriodoOffset] = useState(0);
  const [resumen, setResumen] = useState<SupervisorResumenRowDto[]>([]);
  const [resumenCargando, setResumenCargando] = useState(false);
  const [verResumen, setVerResumen] = useState(false);

  const periodo = useMemo(() => calcularPeriodo(hoyISO(), periodoOffset), [periodoOffset]);

  const cargarPendientes = useCallback(async () => {
    try {
      const r = await api.supervisorPendientes();
      const nuevas = agruparEnTarjasDelDia(r.items ?? []);
      setTarjas(nuevas);
      setSeleccionadas(new Set());
      // Si el cartel abierto se aprobó entero ya no existe: hay que volver a la lista.
      setAbierta((k) => (k && nuevas.some((t) => t.clave === k) ? k : null));
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
    }
  }, []);

  const cargarResumen = useCallback(async () => {
    setResumenCargando(true);
    try {
      const r = await api.supervisorResumen(periodo.desde, periodo.hasta);
      setResumen(r.rows ?? []);
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
    }
    setResumenCargando(false);
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => {
    (async () => {
      setCargando(true);
      try {
        const me = await api.supervisorMe();
        setNombre(me.full_name);
        setSectores((me.sectores ?? []).map((s) => s.name));
      } catch (e) {
        setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
      }
      await cargarPendientes();
      setCargando(false);
    })();
  }, [cargarPendientes]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  const aprobar = async (ids: string[]) => {
    if (ids.length === 0) return;
    setProcesando(true);
    try {
      const r = await api.supervisorAprobar(ids);
      setMensaje({ texto: `${r.aprobadas ?? ids.length} tarja(s) aprobada(s)`, esError: false });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
    }
    setProcesando(false);
    await cargarPendientes();
    await cargarResumen();
  };

  const rechazar = async () => {
    const ids = [...seleccionadas];
    if (ids.length === 0) return;
    setProcesando(true);
    setPidiendoMotivo(false);
    try {
      const r = await api.supervisorRechazar(ids, motivo.trim() || null);
      setMensaje({ texto: `${r.rechazadas ?? ids.length} tarja(s) rechazada(s)`, esError: false });
      setMotivo('');
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error', esError: true });
    }
    setProcesando(false);
    await cargarPendientes();
  };

  const tarjaAbierta = tarjas.find((t) => t.clave === abierta) ?? null;

  const itemsVisibles = useMemo(() => {
    if (!tarjaAbierta) return [];
    let items = tarjaAbierta.items;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      items = items.filter((i) => i.empleado.toLowerCase().includes(q));
    }
    if (filtro) items = items.filter((i) => tieneDato(filtro, i));
    return items;
  }, [tarjaAbierta, busqueda, filtro]);

  const cerrarSesion = () => {
    sesion.cerrarSesionSupervisor();
    onCerrarSesion();
  };

  if (cargando) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--dark-background)' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>{nombre}</div>
            <div style={{ fontSize: 13, color: 'var(--teal)' }}>{sectores.join(' · ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {hasDeviceSession && (
              <button onClick={onCambiarATarja} title="Cambiar a tarja" style={botonIcono}>
                <IconoCambiarSector size={22} />
              </button>
            )}
            <button onClick={cerrarSesion} title="Cerrar sesión" style={botonIcono}>
              <IconoSalir size={22} />
            </button>
          </div>
        </div>

        {tarjaAbierta ? (
          <>
            <button
              onClick={() => {
                setAbierta(null);
                setSeleccionadas(new Set());
                setBusqueda('');
                setFiltro(null);
              }}
              style={{ ...botonSecundario, width: 'auto', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <IconoAnterior size={18} /> Volver
            </button>

            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
              {tarjaAbierta.sectorName} — {fechaLegible(tarjaAbierta.fecha)}
            </div>

            <TextField value={busqueda} onChange={setBusqueda} label="Buscar empleado" />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip activo={filtro === null} onClick={() => setFiltro(null)} texto="Todos" />
              {filtrosDeSector(tarjaAbierta.tiposCarga).map((f) => (
                <Chip
                  key={f.slug}
                  activo={filtro?.slug === f.slug}
                  onClick={() => setFiltro(filtro?.slug === f.slug ? null : f)}
                  texto={f.etiqueta}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSeleccionadas(new Set(itemsVisibles.map((i) => i.id)))} style={botonSecundario}>
                Seleccionar todas
              </button>
              <button onClick={() => setSeleccionadas(new Set())} style={botonSecundario}>
                Ninguna
              </button>
            </div>

            {itemsVisibles.map((i) => {
              const detalle = [formatMinutesWorkedDisplay(i.minutesWorked), formatTiposNuevosRegistro(i.tipos)]
                .filter((s) => s && s !== '?')
                .join(' + ');
              const marcada = seleccionadas.has(i.id);
              return (
                <label
                  key={i.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--card-background)',
                    borderRadius: 12,
                    padding: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() =>
                      setSeleccionadas((s) => {
                        const n = new Set(s);
                        if (!n.delete(i.id)) n.add(i.id);
                        return n;
                      })
                    }
                    style={{ width: 20, height: 20, accentColor: 'var(--purple80)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'white' }}>
                      {i.empleado}
                      {i.fueModificada && (
                        <span className="label-small" style={{ color: 'var(--warning)', marginLeft: 6 }}>
                          editada
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#66bb6a', fontWeight: 600 }}>{detalle}</div>
                  </div>
                </label>
              );
            })}

            {seleccionadas.size > 0 && (
              <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 8 }}>
                <button
                  onClick={() => aprobar([...seleccionadas])}
                  disabled={procesando}
                  style={{ ...botonPrimario, flex: 1 }}
                >
                  Aprobar ({seleccionadas.size})
                </button>
                <button
                  onClick={() => setPidiendoMotivo(true)}
                  disabled={procesando}
                  style={{ ...botonPrimario, flex: 1, background: 'var(--error)' }}
                >
                  Rechazar
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>
              Tarjas pendientes {tarjas.length > 0 && `(${tarjas.length})`}
            </div>

            {tarjas.length === 0 ? (
              <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>No hay tarjas pendientes de aprobación.</div>
            ) : (
              tarjas.map((t) => (
                <div key={t.clave} style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>{t.sectorName}</div>
                      <div style={{ fontSize: 13, color: 'var(--teal)' }}>
                        {fechaLegible(t.fecha)} · {t.cantidadEmpleados} empleados
                      </div>
                    </div>
                    {t.tieneModificadas && (
                      <span className="label-small" style={{ color: 'var(--warning)' }}>editadas</span>
                    )}
                  </div>

                  <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {lineasDeTotales(t.totales).map((l) => (
                      <div key={l} style={{ fontSize: 14, color: '#66bb6a', fontWeight: 600 }}>
                        {l}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setAbierta(t.clave)} style={{ ...botonSecundario, flex: 1 }}>
                      Revisar
                    </button>
                    <button
                      onClick={() => aprobar(t.items.map((i) => i.id))}
                      disabled={procesando}
                      style={{ ...botonPrimario, flex: 1 }}
                    >
                      Aprobar todo
                    </button>
                  </div>
                </div>
              ))
            )}

            <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Horas del período</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setPeriodoOffset((o) => o - 1)} style={botonPeriodo}><IconoAnterior size={22} /></button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--teal)' }}>{periodo.label}</div>
                <button
                  onClick={() => setPeriodoOffset((o) => Math.min(0, o + 1))}
                  disabled={periodoOffset >= 0}
                  style={{ ...botonPeriodo, opacity: periodoOffset >= 0 ? 0.3 : 1 }}
                >
                  <IconoSiguiente size={22} />
                </button>
              </div>
              <button
                onClick={() => setVerResumen(true)}
                style={{ ...botonSecundario, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <IconoGrafico size={20} />
                {resumenCargando ? 'Cargando...' : `Mostrar horas cargadas (${resumen.length})`}
              </button>
            </div>
          </>
        )}
      </div>

      {pidiendoMotivo && (
        <Modal
          titulo="Motivo del rechazo"
          onCerrar={() => setPidiendoMotivo(false)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setPidiendoMotivo(false), tipo: 'texto' },
            { texto: 'Rechazar', onClick: rechazar, peligro: true },
          ]}
        >
          <TextField value={motivo} onChange={setMotivo} label="Motivo (opcional)" />
        </Modal>
      )}

      {verResumen && (
        <ResumenPeriodo rows={resumen} label={periodo.label} onCerrar={() => setVerResumen(false)} />
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}
    </div>
  );
}

function ResumenPeriodo({
  rows,
  label,
  onCerrar,
}: {
  rows: SupervisorResumenRowDto[];
  label: string;
  onCerrar: () => void;
}) {
  const porEmpleado = useMemo(() => {
    const mapa = new Map<string, { nombre: string; sector: string; mw: Array<string | null>; cosecha: number }>();
    for (const r of rows) {
      const clave = r.employee_id;
      const actual = mapa.get(clave) ?? {
        nombre: `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim(),
        sector: r.sector_name,
        mw: [],
        cosecha: 0,
      };
      actual.mw.push(r.minutes_worked);
      actual.cosecha += (r.cosecha_canadas ?? 0) + (r.cosecha_inv ?? 0);
      mapa.set(clave, actual);
    }
    return [...mapa.entries()]
      .map(([id, v]) => {
        const valores = sumar(v.mw);
        return { id, ...v, valores: { ...valores, cosecha: valores.cosecha + v.cosecha } };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows]);

  return (
    <Modal
      titulo="Resumen del período"
      onCerrar={onCerrar}
      ancho={800}
      acciones={[{ texto: 'Cerrar', onClick: onCerrar, tipo: 'texto' }]}
    >
      <div style={{ fontSize: 13, color: 'var(--teal)', marginBottom: 12 }}>{label}</div>
      {porEmpleado.length === 0 ? (
        <div style={{ color: 'var(--texto-tenue)', fontSize: 14 }}>No hay datos en este período.</div>
      ) : (
        porEmpleado.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'white' }}>{e.nombre}</div>
              <div className="label-small" style={{ color: 'var(--texto-tenue)' }}>{e.sector}</div>
            </div>
            <div style={{ fontWeight: 700, color: 'var(--teal)' }}>{fmtHoras(e.valores.horas)}</div>
          </div>
        ))
      )}
    </Modal>
  );
}

function Chip({ texto, activo, onClick }: { texto: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 16,
        border: `1px solid ${activo ? 'var(--teal)' : '#555'}`,
        background: activo ? 'rgba(38,198,218,0.15)' : 'transparent',
        color: activo ? 'var(--teal)' : 'white',
        fontSize: 12,
      }}
    >
      {texto}
    </button>
  );
}

const botonIcono: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--purple80)',
  padding: 8,
  display: 'flex',
};

const botonPrimario: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: 'none',
  background: 'var(--purple80)',
  color: 'white',
  fontWeight: 700,
  fontSize: 14,
};

const botonSecundario: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--purple80)',
  background: 'transparent',
  color: 'var(--purple80)',
  fontWeight: 600,
  fontSize: 14,
  width: '100%',
};

const botonPeriodo: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 18,
  border: '1px solid var(--teal)',
  background: 'transparent',
  color: 'var(--teal)',
  fontSize: 18,
};
