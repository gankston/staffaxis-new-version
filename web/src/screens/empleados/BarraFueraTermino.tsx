/**
 * Cartel de arriba de Empleados mientras se carga una Tarja Fuera de Término:
 * dice que lo que se carga va al pedido (no como tarja normal), cuantas lleva,
 * y deja revisarlas, quitar alguna y mandarlo a autorizar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/ui';
import { api, type ItemFueraTermino, type PedidoFueraTermino } from '../../lib/api';
import { activarPedido, fmtCorta, rangoPedido } from '../../lib/fueraTermino';

export function BarraFueraTermino({
  pedido,
  recarga,
  onItems,
  onMensaje,
}: {
  pedido: PedidoFueraTermino;
  /** Cambia cada vez que se guarda una tarja, para volver a contar. */
  recarga: number;
  onItems: (items: ItemFueraTermino[]) => void;
  onMensaje: (texto: string, esError: boolean) => void;
}) {
  const [items, setItems] = useState<ItemFueraTermino[]>([]);
  const [viendo, setViendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmarSalir, setConfirmarSalir] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api.getPedidoFueraTermino(pedido.id);
      if (r.pedido.estado !== 'borrador') {
        activarPedido(null);
        return;
      }
      setItems(r.items);
      onItems(r.items);
    } catch {
      /* sin conexion: queda lo ultimo */
    }
  }, [pedido.id, onItems]);

  useEffect(() => {
    cargar();
  }, [cargar, recarga]);

  const quitar = async (it: ItemFueraTermino) => {
    try {
      await api.quitarItemFueraTermino(pedido.id, it.id);
      cargar();
    } catch (e) {
      onMensaje(e instanceof Error ? e.message : 'No se pudo quitar', true);
    }
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      await api.enviarFueraTermino(pedido.id);
      setViendo(false);
      activarPedido(null);
      onMensaje('Tarja fuera de término mandada. Te va a llegar un aviso cuando la autoricen.', false);
    } catch (e) {
      onMensaje(e instanceof Error ? e.message : 'No se pudo mandar', true);
    }
    setEnviando(false);
  };

  const horas = items.reduce((a, i) => a + (Number(i.horas) || 0), 0);

  return (
    <>
      <div
        style={{
          background: 'rgba(255,183,77,0.14)',
          border: '1px solid rgba(255,183,77,0.55)',
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: '#ffcc80', fontSize: 15 }}>Tarja Fuera de Término</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            {pedido.motivoTexto} · {rangoPedido(pedido)} · {items.length} cargada{items.length === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--texto-tenue)', marginTop: 2 }}>
            Tocá a cada empleado para cargarle las horas. No cuentan hasta que las autoricen.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setViendo(true)} style={{ ...boton, borderColor: '#ffb74d', color: '#ffcc80' }}>
            Revisar y mandar
          </button>
          <button onClick={() => setConfirmarSalir(true)} style={{ ...boton, borderColor: 'rgba(255,255,255,0.25)', color: 'var(--texto-tenue)' }}>
            Salir
          </button>
        </div>
      </div>

      {viendo && (
        <Modal
          titulo="Revisar y mandar"
          onCerrar={() => setViendo(false)}
          acciones={[
            { texto: 'Seguir cargando', onClick: () => setViendo(false), tipo: 'texto' },
            { texto: enviando ? 'Mandando...' : 'Mandar a autorizar', onClick: enviar, habilitado: items.length > 0 && !enviando },
          ]}
        >
          <div style={{ fontSize: 13, color: 'var(--texto-tenue)', marginBottom: 10 }}>
            {pedido.motivoTexto} · {rangoPedido(pedido)} · {items.length} tarja{items.length === 1 ? '' : 's'} · {fmtNum(horas)} h
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 14, color: 'white' }}>Todavía no cargaste ninguna.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
              {items.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>{it.empleado}</div>
                    <div style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>
                      {fmtCorta(it.date)} · {it.minutesWorked ?? `${it.horas ?? 0} h`}
                    </div>
                  </div>
                  <button onClick={() => quitar(it)} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: 13, fontWeight: 600 }}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
          {enviando && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}><Spinner size={20} /></div>}
        </Modal>
      )}

      {confirmarSalir && (
        <Modal
          titulo="¿Salir de la tarja fuera de término?"
          onCerrar={() => setConfirmarSalir(false)}
          acciones={[
            { texto: 'Cancelar', onClick: () => setConfirmarSalir(false), tipo: 'texto' },
            { texto: 'Salir', onClick: () => { setConfirmarSalir(false); activarPedido(null); } },
          ]}
        >
          <div style={{ fontSize: 14 }}>
            Lo que cargaste queda guardado sin mandar. Lo podés seguir desde la solapa Tarja.
          </div>
        </Modal>
      )}
    </>
  );
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const boton: React.CSSProperties = {
  flex: 1, padding: '9px 10px', borderRadius: 10, border: '1px solid', background: 'transparent', fontSize: 13, fontWeight: 700,
};
