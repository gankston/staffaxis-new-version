/**
 * Port exacto de domain/model/SupervisorTarjaDia.kt: el supervisor ve un cartel
 * por sector y día con los totales, y recién al tocarlo aparece el detalle
 * empleado por empleado.
 */
import type { SupervisorPendingItemDto } from '../lib/api';
import { sumarTipos, TIPOS_NUEVOS_VACIO, type TiposCargaNuevos } from './tiposCarga';

/** Un jornal son 8 horas: el supervisor razona en jornales, no en horas sueltas. */
export const HORAS_POR_JORNAL = 8;

/** Sin decimales si es entero, con coma decimal (es-AR) si no. */
export function fmtNumero(v: number, decimales = 2): string {
  if (v === Math.trunc(v)) return String(Math.trunc(v));
  return v.toFixed(decimales).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',');
}

const aFloat = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined) return null;
  const t = s.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
};

/** Ojo: sólo mira la PRIMERA parte, igual que el Kotlin. */
export function parseHoras(mw: string | null): number {
  const parte = (mw ?? '').split('|')[0];
  if (parte === undefined) return 0;
  return aFloat(parte.startsWith('H ') ? parte.slice(2) : parte) ?? 0;
}

export function parseCosecha(mw: string | null): number {
  const p = (mw ?? '').split('|').find((x) => x.startsWith('C:'));
  return p ? (aFloat(p.slice(2)) ?? 0) : 0;
}

/**
 * La abonada se devuelve como TEXTO: en la base conviven cantidades ("$ 10200")
 * con descripciones ("barcadilla", "14 bolsas"). Sumarla daría cero.
 */
export function parseAbonada(mw: string | null): string | null {
  const p = (mw ?? '').split('|').find((x) => x.startsWith('AB:'));
  if (!p) return null;
  const v = p.slice(3).replace(/\$/g, '').trim();
  return v || null;
}

const RE_CAJAS = /Cajas ([0-9]+(?:[.,][0-9]+)?)/;
const RE_CAJONES = /Cajones ([0-9]+(?:[.,][0-9]+)?)/;

export const parseCajas = (mw: string | null): number => aFloat(RE_CAJAS.exec(mw ?? '')?.[1]) ?? 0;
export const parseCajones = (mw: string | null): number => aFloat(RE_CAJONES.exec(mw ?? '')?.[1]) ?? 0;

export interface TotalesTarja {
  jornales: number;
  cosecha: number;
  cajas: number;
  cajones: number;
  abonadas: string[];
  tiposNuevos: TiposCargaNuevos;
}

/** Las líneas del cartel, ya armadas y sin las que están en cero. */
export function lineasDeTotales(t: TotalesTarja): string[] {
  const out: string[] = [];
  if (t.jornales > 0) out.push(`${fmtNumero(t.jornales)} jornales`);
  if (t.cosecha > 0) out.push(`${fmtNumero(t.cosecha)} cosecha`);
  if (t.cajas > 0) out.push(`${fmtNumero(t.cajas)} cajas`);
  if (t.cajones > 0) out.push(`${fmtNumero(t.cajones)} cajones`);
  if (t.abonadas.length > 0) out.push(`abonada: ${t.abonadas.join(', ')}`);

  const n = t.tiposNuevos;
  if (n.kmViajes !== null && n.kmViajes > 0) out.push(`${fmtNumero(n.kmViajes)} km/viajes`);
  if (n.hasFumigadas !== null && n.hasFumigadas > 0) out.push(`${fmtNumero(n.hasFumigadas)} has fumigadas`);
  if (n.siembraTrilla !== null && n.siembraTrilla > 0) out.push(`${fmtNumero(n.siembraTrilla)} siembra/trilla`);
  if (n.bolseros !== null && n.bolseros > 0) out.push(`${fmtNumero(n.bolseros)} bolseros`);
  if (n.etiquetado !== null && n.etiquetado > 0) out.push(`${fmtNumero(n.etiquetado)} etiquetado`);

  const camion = [
    n.cargaCamionKg50 === true ? '50kg' : null,
    n.cargaCamionKg25 === true ? '25kg' : null,
    n.cargaCamionOtro?.trim() || null,
  ].filter(Boolean) as string[];
  if (camion.length) out.push(`camión ${camion.join('/')}`);

  const estiba = [
    n.movimientoEstibaKg50 === true ? '50kg' : null,
    n.movimientoEstibaKg25 === true ? '25kg' : null,
    n.movimientoEstibaOtro?.trim() || null,
  ].filter(Boolean) as string[];
  if (estiba.length) out.push(`estiba ${estiba.join('/')}`);

  return out;
}

export interface PendienteConTipos extends SupervisorPendingItemDto {
  tipos: TiposCargaNuevos;
}

export function aTiposNuevos(p: SupervisorPendingItemDto): TiposCargaNuevos {
  return {
    kmViajes: p.kmViajes ?? null,
    hasFumigadas: p.hasFumigadas ?? null,
    siembraTrilla: p.siembraTrilla ?? null,
    bolseros: p.bolseros ?? null,
    etiquetado: p.etiquetado ?? null,
    cargaCamionKg50: p.cargaCamionKg50 ?? null,
    cargaCamionKg25: p.cargaCamionKg25 ?? null,
    cargaCamionOtro: p.cargaCamionOtro ?? null,
    movimientoEstibaKg50: p.movimientoEstibaKg50 ?? null,
    movimientoEstibaKg25: p.movimientoEstibaKg25 ?? null,
    movimientoEstibaOtro: p.movimientoEstibaOtro ?? null,
    etiquetadoLata185: p.etiquetadoLata185 ?? null,
    etiquetadoLata750: p.etiquetadoLata750 ?? null,
    etiquetadoLata2500: p.etiquetadoLata2500 ?? null,
    etiquetadoLata8kg: p.etiquetadoLata8kg ?? null,
    descargaJaula: p.descargaJaula ?? null,
    descargaCamion: p.descargaCamion ?? null,
    cargaJaula: p.cargaJaula ?? null,
    cargaCamionCantidad: p.cargaCamionCantidad ?? null,
  };
}

export interface TarjaDelDia {
  clave: string;
  sectorId: string;
  sectorName: string;
  fecha: string;
  tiposCarga: string[];
  items: PendienteConTipos[];
  totales: TotalesTarja;
  cantidadEmpleados: number;
  tieneModificadas: boolean;
}

/** Agrupa las tarjas pendientes en un cartel por sector y día. */
export function agruparEnTarjasDelDia(pendientes: SupervisorPendingItemDto[]): TarjaDelDia[] {
  const grupos = new Map<string, PendienteConTipos[]>();
  for (const p of pendientes) {
    const clave = `${p.sectorId ?? p.sector}|${p.date}`;
    const lista = grupos.get(clave) ?? [];
    lista.push({ ...p, tipos: aTiposNuevos(p) });
    grupos.set(clave, lista);
  }

  const out: TarjaDelDia[] = [];
  for (const [clave, items] of grupos) {
    const primero = items[0];
    let totales: TotalesTarja = {
      jornales: 0,
      cosecha: 0,
      cajas: 0,
      cajones: 0,
      abonadas: [],
      tiposNuevos: TIPOS_NUEVOS_VACIO,
    };
    for (const it of items) {
      const ab = parseAbonada(it.minutesWorked);
      totales = {
        jornales: totales.jornales + parseHoras(it.minutesWorked) / HORAS_POR_JORNAL,
        cosecha: totales.cosecha + parseCosecha(it.minutesWorked),
        cajas: totales.cajas + parseCajas(it.minutesWorked),
        cajones: totales.cajones + parseCajones(it.minutesWorked),
        abonadas: [...new Set([...totales.abonadas, ...(ab ? [ab] : [])])],
        tiposNuevos: sumarTipos(totales.tiposNuevos, it.tipos),
      };
    }
    out.push({
      clave,
      sectorId: clave.split('|')[0],
      sectorName: primero.sector,
      fecha: primero.date,
      tiposCarga: primero.tiposCarga ?? [],
      items: [...items].sort((a, b) => a.empleado.localeCompare(b.empleado)),
      totales,
      cantidadEmpleados: new Set(items.map((i) => i.employeeId)).size,
      tieneModificadas: items.some((i) => i.fueModificada),
    });
  }

  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.sectorName.localeCompare(b.sectorName));
}

// ── Filtros del detalle, armados con los tipos que tiene EL SECTOR ────────────

export interface TipoCargaFiltro {
  slug: string;
  etiqueta: string;
}

const TODOS_LOS_FILTROS: TipoCargaFiltro[] = [
  { slug: 'horas', etiqueta: 'Horas' },
  { slug: 'cosecha', etiqueta: 'Cosecha' },
  { slug: 'abonada', etiqueta: 'Abonada' },
  { slug: 'cajas_cajones', etiqueta: 'Cajas y cajones' },
  { slug: 'km_viajes', etiqueta: 'Km / Viajes' },
  { slug: 'has_fumigadas', etiqueta: 'Has fumigadas' },
  { slug: 'siembra_trilla', etiqueta: 'Siembra / Trilla' },
  { slug: 'bolseros', etiqueta: 'Bolseros' },
  { slug: 'etiquetado', etiqueta: 'Etiquetado' },
  { slug: 'carga_camion', etiqueta: 'Carga de camión' },
  { slug: 'movimiento_estiba', etiqueta: 'Movimiento de estiba' },
];

/** Horas va siempre: todos los sectores cargan horas. */
export function filtrosDeSector(tiposDelSector: string[]): TipoCargaFiltro[] {
  return [
    TODOS_LOS_FILTROS[0],
    ...TODOS_LOS_FILTROS.filter((f) => f.slug !== 'horas' && tiposDelSector.includes(f.slug)),
  ];
}

export function tieneDato(filtro: TipoCargaFiltro, item: PendienteConTipos): boolean {
  const partes = (item.minutesWorked ?? '').split('|');
  const t = item.tipos;
  switch (filtro.slug) {
    case 'horas':
      return parseHoras(item.minutesWorked) > 0;
    case 'cosecha':
      return partes.some((p) => p === 'C' || p.startsWith('C:'));
    case 'abonada':
      return partes.some((p) => p.startsWith('AB:'));
    case 'cajas_cajones':
      return partes.some((p) => p.startsWith('Cajas ') || p.startsWith('Cajones '));
    case 'km_viajes':
      return t.kmViajes !== null;
    case 'has_fumigadas':
      return t.hasFumigadas !== null;
    case 'siembra_trilla':
      return t.siembraTrilla !== null;
    case 'bolseros':
      return t.bolseros !== null;
    case 'etiquetado':
      return t.etiquetado !== null;
    case 'carga_camion':
      return t.cargaCamionKg50 === true || t.cargaCamionKg25 === true || !!t.cargaCamionOtro?.trim();
    case 'movimiento_estiba':
      return t.movimientoEstibaKg50 === true || t.movimientoEstibaKg25 === true || !!t.movimientoEstibaOtro?.trim();
    default:
      return false;
  }
}
