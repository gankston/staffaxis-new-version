/** Clon de TarjaScreen.kt + su ViewModel: estadísticas del día, cierre y visualizador del período. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/ui';
import { Toast } from '../../components/Toast';
import { Visualizador } from './Visualizador';
import { api } from '../../lib/api';
import { listarEmpleados, listarRegistros, type Empleado } from '../../lib/empleados';
import { getSectoresPermitidos, guardarSectorActivo, solicitarAcceso, type Sector } from '../../lib/auth';
import { sesion } from '../../lib/session';
import { cosechaDe, sumar } from '../../domain/tarjaValores';
import type { Registro } from '../../lib/empleados';
import { hoyISO } from '../../domain/fechaCarga';
import { calcularPeriodo, cierreLocal, fmtAbonada, fmtCantidad, fmtHoras, HORAS_POR_JORNAL } from './logica';
import { IconoAnterior, IconoCambiarSector, IconoCheck, IconoCheckCirculo, IconoEnviar, IconoGrafico, IconoSiguiente } from '../../components/iconos';

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES_LARGOS[m - 1]} ${y}`;
};
const fmtHorasMin = (h: number) => (h % 1 === 0 ? `${Math.trunc(h)}h` : `${h}h`);

export function Tarja({
  onCambiarSector,
  onRecargarMain,
}: {
  onCambiarSector: () => void;
  onRecargarMain: () => void;
}) {
  const sector = sesion.getSectorActivo();
  const hoy = hoyISO();

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [ausentesHoy, setAusentesHoy] = useState(0);
  const [registrosHoy, setRegistrosHoy] = useState<Registro[]>([]);
  const [rechazadas, setRechazadas] = useState<Array<{ id: string; empleado: string; date: string; motivo: string | null }>>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [cierre, setCierre] = useState(() => (sector ? cierreLocal.leer(sector.id, hoy) : null));

  const [periodoOffset, setPeriodoOffset] = useState(0);
  const [verVisualizador, setVerVisualizador] = useState(false);
  const [sectoresPermitidos, setSectoresPermitidos] = useState<Sector[]>([]);
  const [verSectores, setVerSectores] = useState(false);
  const [sectorParaCambiar, setSectorParaCambiar] = useState<Sector | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const cargar = useCallback(async () => {
    if (!sector) return;
    setCargando(true);
    try {
      const [emps, regs, aus, rech] = await Promise.all([
        listarEmpleados(sector.id, sector.name),
        listarRegistros({ desde: hoy, hasta: hoy }).catch(() => []),
        api.getAusencias(hoy, hoy).catch(() => ({ absences: [] })),
        api.getRechazadas().catch(() => ({ items: [] })),
      ]);
      setEmpleados(emps);
      setRegistrosHoy(regs);
      setAusentesHoy(
        (aus.absences ?? []).filter(
          (a) => a.is_justified && a.start_date.slice(0, 10) <= hoy && a.end_date.slice(0, 10) >= hoy,
        ).length,
      );
      setRechazadas((rech.items ?? []).map((r) => ({ id: r.id, empleado: r.empleado, date: r.date.slice(0, 10), motivo: r.motivo })));
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error al cargar', esError: true });
    }
    setCargando(false);
  }, [sector, hoy]);

  useEffect(() => {
    cargar();
    getSectoresPermitidos().then(setSectoresPermitidos).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Totales en vivo del día, con el mismo parser que la app.
  const valores = useMemo(() => {
    const v = sumar(registrosHoy.map((r) => r.minutesWorked));
    // La cosecha se recalcula leyendo las columnas: el "C:" del texto ya no se
    // escribe y sumarlo solo de ahi dejaria en cero todo lo cargado por origen.
    return { ...v, cosecha: registrosHoy.reduce((acc, r) => acc + cosechaDe(r.minutesWorked, r.tiposNuevos), 0) };
  }, [registrosHoy]);
  const periodo = useMemo(() => calcularPeriodo(hoy, periodoOffset), [hoy, periodoOffset]);

  const cerrarTarja = async () => {
    if (!sector) return;
    setCerrando(true);
    // En la app esto vacía el outbox local; acá cada tarja ya se mandó al
    // guardarla, así que sólo queda registrar el cierre del día en el dispositivo.
    const nuevo = {
      enviada: true,
      horaEnvio: Date.now(),
      empleadosTarjados: registrosHoy.length,
      horasTarjadas: valores.horas,
      abonada: valores.abonada,
    };
    cierreLocal.guardar(sector.id, hoy, nuevo);
    setCierre(nuevo);
    setCerrando(false);
    setMensaje({ texto: 'Tarja cerrada correctamente', esError: false });
  };

  const cambiarASector = async (s: Sector) => {
    try {
      await solicitarAcceso(s, sesion.getFullName() ?? sector?.encargado ?? sector?.name ?? '');
      guardarSectorActivo(s);
      onRecargarMain();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error al cambiar de sector', esError: true });
    }
  };

  if (!sector) return null;

  const hayExtras = valores.cosecha > 0 || valores.cajas > 0 || valores.cajones > 0 || valores.abonada > 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'white', lineHeight: 1.15 }}>
              Hola {sesion.getFullName() ?? sector.encargado ?? sector.name}
            </div>
            <div style={{ fontSize: 16, color: 'var(--teal)' }}>Sector: {sector.name}</div>
          </div>
          <div style={{ textAlign: 'right', position: 'relative' }}>
            <div className="label-small" style={{ color: 'var(--texto-tenue)' }}>{fechaLarga(hoy)}</div>
            {sectoresPermitidos.length > 1 && (
              <>
                <button
                  onClick={() => setVerSectores((v) => !v)}
                  className="label-small"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--teal)', padding: '2px 8px' }}
                >
                  <IconoCambiarSector size={16} /> Cambiar sector
                </button>
                {verSectores && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      background: 'var(--card-background)',
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      zIndex: 20,
                      minWidth: 220,
                      maxHeight: 320,
                      overflowY: 'auto',
                    }}
                  >
                    {sectoresPermitidos.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setVerSectores(false);
                          setSectorParaCambiar(s);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '14px 16px',
                          background: 'transparent',
                          border: 'none',
                          color: s.id === sector.id ? 'var(--teal)' : 'white',
                          fontSize: 15,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {s.id === sector.id && <IconoCheck size={14} />} {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Estadísticas del día */}
        <div
          style={{
            borderRadius: 20,
            padding: 20,
            background: 'linear-gradient(90deg, #6a1b9a, #1976d2, #26c6da)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Estadísticas del día</div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <Stat valor={String(registrosHoy.length)} label="Tarjados" />
            <Stat valor={String(empleados.length)} label="Total" />
            <Stat valor={fmtHoras(valores.horas)} label="Horas" />
            <Stat valor={String(ausentesHoy)} label="Ausentes" />
          </div>
          {hayExtras && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <Stat valor={fmtCantidad(valores.cosecha)} label="Cosecha" />
                <Stat valor={String(valores.cajas)} label="Cajas" />
                <Stat valor={String(valores.cajones)} label="Cajones" />
                <Stat valor={fmtAbonada(valores.abonada)} label="Abonada" />
              </div>
            </>
          )}
        </div>

        {/* Resumen del día — mismo formato que la app: verde, con jornales y abonada */}
        {cierre?.enviada ? (
          <div
            style={{
              borderRadius: 16,
              padding: 16,
              background: 'linear-gradient(160deg, #2e7d32, #1b5e20)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#a5d6a7', display: 'flex' }}>
                <IconoCheckCirculo size={26} />
              </span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>
                Tarja del {hoy.split('-').reverse().join('/')} enviada
              </span>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.25)' }} />

            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <Stat valor={String(cierre.empleadosTarjados)} label="Empleados tarjados" />
              <Stat valor={fmtHorasMin(cierre.horasTarjadas)} label="Horas tarjadas" />
              <Stat valor={fmtCantidad(cierre.horasTarjadas / HORAS_POR_JORNAL)} label="Jornales de hoy" />
            </div>

            {cierre.abonada > 0 && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'white' }}>{fmtAbonada(cierre.abonada)}</div>
                  <div className="label-small" style={{ color: 'rgba(255,255,255,0.8)' }}>Abonada</div>
                </div>
              </>
            )}

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
              Enviado a las{' '}
              {new Date(cierre.horaEnvio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 700, color: 'var(--warning)' }}>Tarja sin cerrar</div>
              <div style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>
                {registrosHoy.length} de {empleados.length} empleados tarjados
              </div>
            </div>
          </div>
        )}

        {/* Tarjas rechazadas por el supervisor */}
        {rechazadas.length > 0 && (
          <div style={{ background: 'rgba(255,82,82,0.12)', borderRadius: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>
              {rechazadas.length} tarja{rechazadas.length > 1 ? 's' : ''} rechazada{rechazadas.length > 1 ? 's' : ''}
            </div>
            {rechazadas.map((r) => (
              <div key={r.id} style={{ fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: 'white' }}>{r.empleado}</span>{' '}
                <span style={{ color: 'var(--texto-tenue)' }}>({r.date.split('-').reverse().join('/')})</span>
                {r.motivo && <div style={{ color: 'var(--error)', fontSize: 12 }}>{r.motivo}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Cierre de tarja */}
        <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Cierre de Tarja</div>

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
            onClick={() => setVerVisualizador(true)}
            style={{ ...botonSecundario, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <IconoGrafico size={20} /> Mostrar horas cargadas
          </button>

          {/* Mismos textos que la app: el boton cambia a "Reenviar" si el dia ya
              se cerro. En la web no queda nada por mandar (cada tarja se envia
              al guardarla), pero el rotulo es el que los supervisores conocen. */}
          <button
            onClick={cerrarTarja}
            disabled={cerrando}
            style={{
              width: '100%',
              padding: 14,
              border: 'none',
              borderRadius: 12,
              background: 'linear-gradient(90deg, #9c27b0, #26c6da)',
              color: 'white',
              fontWeight: 700,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {cerrando ? (
              <>
                <Spinner size={18} /> Enviando tarja...
              </>
            ) : (
              <>
                <IconoEnviar size={20} /> {cierre?.enviada ? 'Reenviar tarja' : 'Realizar cierre de tarja'}
              </>
            )}
          </button>
        </div>

        {cargando && <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>}
      </div>

      {sectorParaCambiar && (
        <Modal
          titulo="¿Cambiar de sector?"
          icono={<span style={{ color: 'var(--teal)', display: 'flex', justifyContent: 'center' }}><IconoCambiarSector size={28} /></span>}
          onCerrar={() => setSectorParaCambiar(null)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setSectorParaCambiar(null), tipo: 'texto' },
            {
              texto: 'Cambiar',
              onClick: () => {
                const s = sectorParaCambiar;
                setSectorParaCambiar(null);
                cambiarASector(s);
              },
            },
          ]}
        >
          <div style={{ fontSize: 14 }}>
            Vas a pasar al sector {sectorParaCambiar.name}. La app va a recargar los datos.
          </div>
        </Modal>
      )}

      {verVisualizador && (
        <Visualizador
          sectorId={sector.id}
          sectorName={sector.name}
          desde={periodo.desde}
          hasta={periodo.hasta}
          onCerrar={() => setVerVisualizador(false)}
        />
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}

      {/* onCambiarSector queda disponible para el flujo de volver al selector */}
      <span hidden onClick={onCambiarSector} />
    </div>
  );
}

function Stat({ valor, label }: { valor: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>{valor}</div>
      <div className="label-small" style={{ color: 'rgba(255,255,255,0.8)' }}>{label}</div>
    </div>
  );
}

const botonPeriodo: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 18,
  border: '1px solid var(--teal)',
  background: 'transparent',
  color: 'var(--teal)',
  fontSize: 18,
};

const botonSecundario: React.CSSProperties = {
  width: '100%',
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--purple80)',
  background: 'transparent',
  color: 'var(--purple80)',
  fontWeight: 600,
  fontSize: 14,
};
