/**
 * La lista de Tarjas Fuera de Término para autorizar, con su detalle y los
 * botones Autorizar / No autorizar. La usan los tres que autorizan desde el
 * telefono, cada uno con su entrada al servidor:
 *   - Facundo (cortes de luz e internet): pantalla "Modo autorizante".
 *   - Jefe del sector con telefono de encargado (Orellana, Marce): solapa
 *     "Autorizante" abajo.
 *   - Jefe de zona en modo supervisor (Poelstra): seccion "Autorizante" abajo.
 * No dibuja encabezado: cada pantalla pone el suyo.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Spinner, TextField } from './ui';
import { Toast } from './Toast';
import type { PedidoFueraTermino, PendienteFueraTermino } from '../lib/api';
import { ESTADOS, fmtCorta, rangoPedido } from '../lib/fueraTermino';

export function PanelAutorizar({
  cargar,
  aprobar,
  rechazar,
  textoAprobada,
  textoRechazoVacio,
  onCantidad,
}: {
  cargar: () => Promise<{ pendientes: PendienteFueraTermino[]; resueltos: PedidoFueraTermino[] }>;
  /** Si el servidor devuelve `mensaje` (que paso y a quien le toca), se muestra ese. */
  aprobar: (id: string) => Promise<{ mensaje?: string } | unknown>;
  rechazar: (id: string, motivo: string) => Promise<unknown>;
  textoAprobada: string;
  /** Lo que queda escrito si el que no autoriza deja el motivo vacio. */
  textoRechazoVacio: string;
  /** Para el numerito de la solapa. */
  onCantidad?: (n: number) => void;
}) {
  const [pendientes, setPendientes] = useState<PendienteFueraTermino[] | null>(null);
  const [resueltos, setResueltos] = useState<PedidoFueraTermino[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<PendienteFueraTermino | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  const recargar = useCallback(async () => {
    try {
      const r = await cargar();
      setPendientes(r.pendientes);
      setResueltos(r.resueltos);
      onCantidad?.(r.pendientes.length);
    } catch (e) {
      setPendientes((p) => p ?? []);
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo cargar', esError: true });
    }
    // cargar/onCantidad vienen de la pantalla y no cambian mientras esta abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, 30_000);
    return () => clearInterval(id);
  }, [recargar]);

  const autorizar = async (p: PendienteFueraTermino) => {
    setTrabajando(true);
    try {
      const r = await aprobar(p.id);
      const delServidor = (r as { mensaje?: string } | null)?.mensaje;
      setMensaje({ texto: delServidor || textoAprobada, esError: false });
      recargar();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo autorizar', esError: true });
    }
    setTrabajando(false);
  };

  const noAutorizar = async () => {
    if (!rechazando) return;
    setTrabajando(true);
    try {
      await rechazar(rechazando.id, motivo.trim());
      setRechazando(null);
      setMotivo('');
      setMensaje({ texto: 'No autorizada. Al encargado le llega el aviso.', esError: false });
      recargar();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo guardar', esError: true });
    }
    setTrabajando(false);
  };

  return (
    <>
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
              {p.jefePor && (
                <div style={{ color: '#81c784', fontSize: 13 }}>Ya la aprobó {p.jefePor}</div>
              )}
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
                onClick={() => autorizar(p)}
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

      {rechazando && (
        <Modal
          titulo="No autorizar"
          onCerrar={() => setRechazando(null)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setRechazando(null), tipo: 'texto' },
            { texto: trabajando ? 'Guardando...' : 'No autorizar', onClick: noAutorizar, habilitado: !trabajando },
          ]}
        >
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            {rechazando.sector} · {rechazando.motivoTexto} · {rangoPedido(rechazando)}
          </div>
          <TextField value={motivo} onChange={setMotivo} label="Motivo (lo ve el encargado)" multilinea />
          <div style={{ fontSize: 12, color: 'var(--texto-tenue)', marginTop: 6 }}>
            Si lo dejás vacío dice "{textoRechazoVacio}".
          </div>
        </Modal>
      )}

      {mensaje && <Toast texto={mensaje.texto} esError={mensaje.esError} onCerrar={() => setMensaje(null)} />}
    </>
  );
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
