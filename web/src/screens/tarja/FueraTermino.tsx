/**
 * Tarja Fuera de Término (lado del encargado, solapa Tarja).
 *
 * Para los dias que ya no entran por la carga normal. El encargado elige el
 * motivo y las fechas, carga las horas en Empleados como siempre, y lo manda.
 * Las horas no cuentan hasta que lo autorizan (primero se verifica el corte,
 * despues RRHH da el OK final y recien ahi se suben).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/ui';
import { IconoCalendario, IconoCheck, IconoDesplegar } from '../../components/iconos';
import { api, type PedidoFueraTermino } from '../../lib/api';
import { activarPedido, alCambiarPedido, ESTADOS, pedidoActivo, rangoPedido } from '../../lib/fueraTermino';
import { diasAtras, desdeISO, hoyISO, sumarDias } from '../../domain/fechaCarga';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const etiqueta = (iso: string) => `${DIAS[desdeISO(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DIAS_MAXIMO_ATRAS = 45;

export function FueraTermino({
  sectorId,
  onIrACargar,
  onMensaje,
}: {
  sectorId: string;
  onIrACargar: () => void;
  onMensaje: (texto: string, esError: boolean) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoFueraTermino[] | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [creando, setCreando] = useState(false);
  const [activo, setActivo] = useState(() => pedidoActivo());

  const cargar = useCallback(async () => {
    try {
      const r = await api.getFueraTermino();
      setPedidos(r.pedidos);
      setMotivos(r.motivos);
      // Si el pedido activo ya se mando (o se descarto) desde otro lado, se suelta.
      const act = pedidoActivo();
      if (act && !r.pedidos.some((p) => p.id === act.id && p.estado === 'borrador')) activarPedido(null);
    } catch {
      setPedidos((p) => p ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
    const off = alCambiarPedido(setActivo);
    // En vivo: si lo autorizan mientras esta mirando, el estado cambia solo.
    const id = setInterval(cargar, 30_000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [cargar]);

  const seguir = (p: PedidoFueraTermino) => {
    activarPedido(p);
    onIrACargar();
  };

  const descartar = async (p: PedidoFueraTermino) => {
    try {
      await api.descartarFueraTermino(p.id);
      if (activo?.id === p.id) activarPedido(null);
      cargar();
    } catch (e) {
      onMensaje(e instanceof Error ? e.message : 'No se pudo descartar', true);
    }
  };

  return (
    <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Tarja Fuera de Término</div>
        <div style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: 2, lineHeight: 1.4 }}>
          Para los días que ya no se pueden tarjar. Las horas se suben recién cuando las autorizan.
        </div>
      </div>

      <button onClick={() => setCreando(true)} style={botonPrincipal}>
        Cargar tarja fuera de término
      </button>

      {pedidos === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}><Spinner size={20} /></div>
      ) : (
        pedidos.slice(0, 6).map((p) => {
          const est = ESTADOS[p.estado] ?? { texto: p.estado, color: '#b0b0b0' };
          return (
            <div key={p.id} style={{ borderRadius: 12, background: 'rgba(255,255,255,0.05)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                    {p.motivoTexto} · {rangoPedido(p)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
                    {p.items} tarja{p.items === 1 ? '' : 's'} · {fmtNum(p.horas)} h
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: est.color, border: `1px solid ${est.color}`, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  {est.texto}
                </span>
              </div>
              {p.estado === 'no_autorizada' && p.motivoRechazo && (
                <div style={{ fontSize: 12, color: 'var(--error)' }}>{p.motivoRechazo}</div>
              )}
              {p.estado === 'autorizada' && p.resultado && (
                <div style={{ fontSize: 12, color: '#a5d6a7' }}>
                  Se cargaron {p.resultado.cargadas}.
                  {p.resultado.salteadas.length > 0 &&
                    ` No se cargaron ${p.resultado.salteadas.length} porque ese día ya tenían tarja.`}
                </div>
              )}
              {p.estado === 'borrador' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => seguir(p)} style={{ ...botonChico, borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    {activo?.id === p.id ? 'Seguir cargando' : 'Cargar horas'}
                  </button>
                  <button onClick={() => descartar(p)} style={{ ...botonChico, borderColor: 'rgba(255,255,255,0.25)', color: 'var(--texto-tenue)' }}>
                    Descartar
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {creando && (
        <DialogoNuevoPedido
          sectorId={sectorId}
          motivos={motivos}
          onCerrar={() => setCreando(false)}
          onCreado={(p) => {
            setCreando(false);
            activarPedido(p);
            cargar();
            onIrACargar();
          }}
        />
      )}
    </div>
  );
}

function DialogoNuevoPedido({
  sectorId,
  motivos,
  onCerrar,
  onCreado,
}: {
  sectorId: string;
  motivos: Record<string, string>;
  onCerrar: () => void;
  onCreado: (p: PedidoFueraTermino) => void;
}) {
  const hoy = hoyISO();
  // Las fechas que NO entran por la carga normal: de antes de ayer (o de lo que
  // permita el sector) para atras, hasta un mes y medio.
  const fechas = useMemo(() => {
    const masNueva = sumarDias(hoy, -(diasAtras(sectorId) + 1));
    const out: string[] = [];
    for (let i = 0; i < DIAS_MAXIMO_ATRAS; i++) {
      const f = sumarDias(masNueva, -i);
      if (f < sumarDias(hoy, -DIAS_MAXIMO_ATRAS)) break;
      out.push(f);
    }
    return out;
  }, [hoy, sectorId]);

  const [motivo, setMotivo] = useState<string | null>(null);
  const [desde, setDesde] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = !!motivo && !!desde && !!hasta && desde <= hasta && !guardando;

  const crear = async () => {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await api.crearFueraTermino({ motivo: motivo!, fecha_desde: desde!, fecha_hasta: hasta! });
      onCreado(r.pedido);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Tarja Fuera de Término"
      onCerrar={onCerrar}
      acciones={[
        { texto: 'Cancelar', onClick: onCerrar, tipo: 'texto' },
        { texto: guardando ? 'Creando...' : 'Seguir', onClick: crear, habilitado: listo },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={rotulo}>Motivo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(motivos).map(([clave, texto]) => {
              const elegido = motivo === clave;
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setMotivo(clave)}
                  style={{
                    ...opcion,
                    border: elegido ? '1px solid var(--purple80)' : '1px solid rgba(255,255,255,0.12)',
                    background: elegido ? 'rgba(156,39,176,0.35)' : 'rgba(255,255,255,0.06)',
                    fontWeight: elegido ? 700 : 500,
                  }}
                >
                  <span>{texto}</span>
                  {elegido && <IconoCheck size={20} />}
                </button>
              );
            })}
          </div>
        </div>

        <ElegirFecha rotulo="Desde" fechas={fechas} valor={desde} onElegir={(f) => { setDesde(f); if (!hasta || hasta < f) setHasta(f); }} />
        <ElegirFecha rotulo="Hasta" fechas={fechas.filter((f) => !desde || f >= desde)} valor={hasta} onElegir={setHasta} />

        <div style={{ fontSize: 12, color: 'var(--texto-tenue)', lineHeight: 1.4 }}>
          Después cargás las horas de cada empleado como siempre, y al final lo mandás a autorizar.
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--error)' }}>{error}</div>}
      </div>
    </Modal>
  );
}

function ElegirFecha({
  rotulo: texto,
  fechas,
  valor,
  onElegir,
}: {
  rotulo: string;
  fechas: string[];
  valor: string | null;
  onElegir: (f: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <div style={rotulo}>{texto}</div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 46,
          borderRadius: 20, border: '1px solid var(--purple80)', background: abierto ? 'rgba(206,147,216,0.12)' : 'transparent',
          color: 'var(--purple80)', fontSize: 14, textTransform: 'capitalize',
        }}
      >
        <IconoCalendario size={18} /> {valor ? etiqueta(valor) : 'Elegí el día'}
        <span style={{ display: 'flex', transform: abierto ? 'rotate(180deg)' : 'none' }}><IconoDesplegar size={20} /></span>
      </button>
      {abierto && (
        <div role="listbox" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          {fechas.map((f) => {
            const elegida = f === valor;
            return (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={elegida}
                onClick={() => { onElegir(f); setAbierto(false); }}
                style={{
                  ...opcion,
                  minHeight: 42,
                  border: elegida ? '1px solid var(--purple80)' : '1px solid rgba(255,255,255,0.12)',
                  background: elegida ? 'rgba(156,39,176,0.35)' : 'rgba(255,255,255,0.06)',
                  textTransform: 'capitalize',
                }}
              >
                <span>{etiqueta(f)}</span>
                {elegida && <IconoCheck size={18} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const rotulo: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 6 };

const opcion: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 46,
  padding: '0 16px', borderRadius: 14, color: 'white', fontSize: 15, cursor: 'pointer', textAlign: 'left',
};

const botonPrincipal: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ffb74d', background: 'rgba(255,183,77,0.1)',
  color: '#ffcc80', fontWeight: 700, fontSize: 14,
};

const botonChico: React.CSSProperties = {
  flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid', background: 'transparent', fontSize: 13, fontWeight: 600,
};
