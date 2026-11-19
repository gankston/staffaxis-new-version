/**
 * Modo autorizante: el que verifica los cortes de luz e internet (Facundo
 * Zingone) confirma o no las Tarjas Fuera de Término de esos motivos. Si
 * confirma, pasan a RRHH en StaffAdmin; si no, al encargado le llega el aviso
 * "Tarja fuera de término no aprobada".
 *
 * No es la aprobacion de los supervisores: es otro circuito y otra sesion.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Spinner, TextField } from '../components/ui';
import { Toast } from '../components/Toast';
import { api, type ItemFueraTermino, type PedidoFueraTermino } from '../lib/api';
import { sesion } from '../lib/session';
import { ESTADOS, fmtCorta, rangoPedido } from '../lib/fueraTermino';

type Pendiente = PedidoFueraTermino & { detalle: ItemFueraTermino[] };

export function Autorizante({ onVolver }: { onVolver: () => void }) {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [resueltos, setResueltos] = useState<PedidoFueraTermino[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<Pendiente | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.getPedidosAutorizante();
      setPendientes(r.pendientes);
      setResueltos(r.resueltos);
    } catch (e) {
      setPendientes((p) => p ?? []);
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo cargar', esError: true });
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 30_000);
    return () => clearInterval(id);
  }, [cargar]);

  const confirmar = async (p: Pendiente) => {
    setTrabajando(true);
    try {
      await api.confirmarCorte(p.id);
      setMensaje({ texto: 'Autorizada. Ahora pasa a RRHH para el OK final.', esError: false });
      cargar();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo autorizar', esError: true });
    }
    setTrabajando(false);
  };

  const rechazar = async () => {
    if (!rechazando) return;
    setTrabajando(true);
    try {
      await api.rechazarCorte(rechazando.id, motivo.trim());
      setRechazando(null);
      setMotivo('');
      setMensaje({ texto: 'No autorizada. Al encargado le llega el aviso.', esError: false });
      cargar();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo guardar', esError: true });
    }
    setTrabajando(false);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--dark-background)' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>Modo autorizante</div>
            <div style={{ fontSize: 14, color: 'var(--teal)' }}>{sesion.getAutorizanteNombre() ?? ''}</div>
            <div style={{ fontSize: 13, color: 'var(--texto-tenue)', marginTop: 4, lineHeight: 1.4 }}>
              Revisá y autorizá las tarjas cargadas fuera de término por cortes de luz o de internet.
            </div>
          </div>
          <button onClick={onVolver} style={{ background: 'none', border: '1px solid var(--purple80)', color: 'var(--purple80)', borderRadius: 10, padding: '6px 12px', fontSize: 13 }}>
            Volver
          </button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 4 }}>
          Para autorizar{pendientes ? ` (${pendientes.length})` : ''}
        </div>

        {pendientes === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : pendientes.length === 0 ? (
          <div style={{ background: 'var(--card-background)', borderRadius: 16, padding: 16, color: 'var(--texto-tenue)', fontSize: 14 }}>
            No hay nada esperando. Cuando un encargado mande una, te llega una notificación.
          </div>
        ) : (
          pendientes.map((p) => (
            <div key={p.id} style={{ background: 'var(--card-background)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{p.sector}</div>
                <div style={{ color: '#ffcc80', fontSize: 14, fontWeight: 600 }}>
                  {p.motivoTexto} · {rangoPedido(p)}
                </div>
                <div style={{ color: 'var(--texto-tenue)', fontSize: 13 }}>
                  {p.encargado ? `Encargado: ${p.encargado} · ` : ''}
                  {p.items} tarja{p.items === 1 ? '' : 's'} · {fmtNum(p.horas)} h
                </div>
              </div>

              <button
                onClick={() => setAbierto((a) => (a === p.id ? null : p.id))}
                style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 13, textAlign: 'left', padding: 0 }}
              >
                {abierto === p.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              {abierto === p.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.detalle.map((it) => (
                    <div key={it.id} style={{ fontSize: 13, color: 'white', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--texto-tenue)', minWidth: 42 }}>{fmtCorta(it.date)}</span>
                      <span style={{ flex: 1 }}>{it.empleado}</span>
                      <span style={{ color: 'var(--texto-tenue)' }}>{it.minutesWorked ?? `${it.horas ?? 0} h`}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={trabajando}
                  onClick={() => confirmar(p)}
                  style={{ flex: 1, padding: 12, border: 'none', borderRadius: 12, background: 'linear-gradient(90deg, #9c27b0, #26c6da)', color: 'white', fontWeight: 700, fontSize: 14 }}
                >
                  Autorizar
                </button>
                <button
                  disabled={trabajando}
                  onClick={() => { setRechazando(p); setMotivo(''); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid var(--error)', background: 'transparent', color: 'var(--error)', fontWeight: 700, fontSize: 14 }}
                >
                  No autorizar
                </button>
              </div>
            </div>
          ))
        )}

        {resueltos.length > 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 8 }}>Últimas que revisaste</div>
            {resueltos.map((p) => {
              const est = ESTADOS[p.estado] ?? { texto: p.estado, color: '#b0b0b0' };
              return (
                <div key={p.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 14 }}>{p.sector}</div>
                    <div style={{ color: 'var(--texto-tenue)', fontSize: 12 }}>{p.motivoTexto} · {rangoPedido(p)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: est.color, border: `1px solid ${est.color}`, borderRadius: 10, padding: '2px 8px' }}>
                    {est.texto}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {rechazando && (
        <Modal
          titulo="No autorizar"
          onCerrar={() => setRechazando(null)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setRechazando(null), tipo: 'texto' },
            { texto: trabajando ? 'Guardando...' : 'No autorizar', onClick: rechazar, habilitado: !trabajando },
          ]}
        >
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            {rechazando.sector} · {rechazando.motivoTexto} · {rangoPedido(rechazando)}
          </div>
          <TextField
            value={motivo}
            onChange={setMotivo}
            label="Motivo (lo ve el encargado)"
            multilinea
          />
          <div style={{ fontSize: 12, color: 'var(--texto-tenue)', marginTop: 6 }}>
            Si lo dejás vacío dice "No se confirmó el corte".
          </div>
        </Modal>
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}
    </div>
  );
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
