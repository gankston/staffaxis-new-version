/**
 * Tarja Fuera de Término: el pedido que el encargado esta cargando ahora.
 *
 * Mientras hay uno activo, la pantalla de Empleados carga las horas EN EL
 * PEDIDO (no como tarja normal) y solo deja elegir las fechas del pedido. Se
 * guarda en el telefono para que, si cierra la app a mitad de camino, al volver
 * siga donde estaba (las horas ya cargadas estan en el servidor).
 */
import type { PedidoFueraTermino } from './api';
import { sumarDias } from '../domain/fechaCarga';

const CLAVE = 'staffaxis_fuera_termino_activo';
type Oyente = (p: PedidoFueraTermino | null) => void;
const oyentes = new Set<Oyente>();

export function pedidoActivo(): PedidoFueraTermino | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as PedidoFueraTermino) : null;
  } catch {
    return null;
  }
}

export function activarPedido(p: PedidoFueraTermino | null): void {
  try {
    if (p) localStorage.setItem(CLAVE, JSON.stringify(p));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin storage: queda solo en memoria hasta cerrar */
  }
  for (const fn of oyentes) fn(p);
}

export function alCambiarPedido(fn: Oyente): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Las fechas del pedido, de la mas nueva a la mas vieja (como el selector). */
export function fechasDelPedido(p: PedidoFueraTermino): string[] {
  const out: string[] = [];
  for (let f = p.fechaHasta; f >= p.fechaDesde; f = sumarDias(f, -1)) out.push(f);
  return out;
}

export const fmtCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const rangoPedido = (p: { fechaDesde: string; fechaHasta: string }) =>
  p.fechaDesde === p.fechaHasta ? fmtCorta(p.fechaDesde) : `${fmtCorta(p.fechaDesde)} al ${fmtCorta(p.fechaHasta)}`;

export const ESTADOS: Record<string, { texto: string; color: string }> = {
  borrador: { texto: 'Sin mandar', color: '#b0b0b0' },
  esperando_verificacion: { texto: 'Esperando verificación', color: '#ffb74d' },
  esperando_rrhh: { texto: 'Esperando RRHH', color: '#ffb74d' },
  esperando_jefe: { texto: 'Esperando autorización', color: '#ffb74d' },
  esperando_jefe_zona: { texto: 'Esperando autorización', color: '#ffb74d' },
  autorizada: { texto: 'Autorizada', color: '#81c784' },
  no_autorizada: { texto: 'No aprobada', color: '#ff8a80' },
};
