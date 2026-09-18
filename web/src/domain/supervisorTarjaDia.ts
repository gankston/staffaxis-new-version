/**
 * Port exacto de domain/model/SupervisorTarjaDia.kt: el supervisor ve un cartel
 * por sector y día con los totales, y recién al tocarlo aparece el detalle
 * empleado por empleado.
 */
import type { SupervisorPendingItemDto } from '../lib/api';
import { sumarTipos, TIPOS_NUEVOS_VACIO, type TiposCargaNuevos, aNumero } from './tiposCarga';

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
 * La cosecha de una tarja: el "C:" de las viejas MAS las columnas por tipo de
 * las nuevas. Una tarja tiene una cosa o la otra, nunca las dos, asi que no se
 * duplica.
 */
export function cosechaDeItem(mw: string | null, t: TiposCargaNuevos): number {
  return parseCosecha(mw) + (t.cosechaCanadas ?? 0) + (t.cosechaInv ?? 0) + (t.cosechaBananas ?? 0);
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
  // El desglose de la cosecha, abajo del total.
  const cosechas = [
    n.cosechaCanadas ? `Cañadas ${fmtNumero(n.cosechaCanadas)}` : null,
    n.cosechaInv ? `Raigón/Inv ${fmtNumero(n.cosechaInv)}` : null,
    n.cosechaBananas ? `Bananas ${fmtNumero(n.cosechaBananas)}` : null,
  ].filter(Boolean) as string[];
  if (cosechas.length) out.push(cosechas.join(' · '));

  const tanteros = [
    n.tanteroInvernadero ? `invernadero ${fmtNumero(n.tanteroInvernadero)}` : null,
    n.tanteroCampo ? `campo ${fmtNumero(n.tanteroCampo)}` : null,
  ].filter(Boolean) as string[];
  if (tanteros.length) out.push(`tantero ${tanteros.join(' · ')}`);

  if (n.kmViajes !== null && n.kmViajes > 0) out.push(`${fmtNumero(n.kmViajes)} km/viajes`);
  if (n.hasFumigadas !== null && n.hasFumigadas > 0) out.push(`${fmtNumero(n.hasFumigadas)} has fumigadas`);
  if (n.siembraTrilla !== null && n.siembraTrilla > 0) out.push(`${fmtNumero(n.siembraTrilla)} siembra/trilla`);
  if (n.bolseros !== null && n.bolseros > 0) out.push(`${fmtNumero(n.bolseros)} bolseros`);
  if (n.etiquetado !== null && n.etiquetado > 0) out.push(`${fmtNumero(n.etiquetado)} etiquetado`);

  const latas = [
    n.etiquetadoLata185 ? `185 grs: ${fmtNumero(n.etiquetadoLata185)}` : null,
    n.etiquetadoLata750 ? `750 grs: ${fmtNumero(n.etiquetadoLata750)}` : null,
    n.etiquetadoLata2500 ? `2500 grs: ${fmtNumero(n.etiquetadoLata2500)}` : null,
    n.etiquetadoLata8kg ? `8 kgs: ${fmtNumero(n.etiquetadoLata8kg)}` : null,
  ].filter(Boolean) as string[];
  if (latas.length) out.push(`etiquetado ${latas.join(' · ')}`);

  const descarga = [
    n.descargaJaula ? `jaula ${fmtNumero(n.descargaJaula)}` : null,
    n.descargaCamion ? `camión ${fmtNumero(n.descargaCamion)}` : null,
  ].filter(Boolean) as string[];
  if (descarga.length) out.push(`descarga ${descarga.join(' · ')}`);

  const carga = [
    n.cargaJaula ? `jaula ${fmtNumero(n.cargaJaula)}` : null,
    n.cargaCamionCantidad ? `camión ${fmtNumero(n.cargaCamionCantidad)}` : null,
  ].filter(Boolean) as string[];
  if (carga.length) out.push(`carga ${carga.join(' · ')}`);

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
    kmViajes: aNumero(p.kmViajes),
    cosechaCanadas: aNumero(p.cosechaCanadas),
    cosechaInv: aNumero(p.cosechaInv),
    cosechaBananas: aNumero(p.cosechaBananas),
    tanteroInvernadero: aNumero(p.tanteroInvernadero),
    tanteroCampo: aNumero(p.tanteroCampo),
    hasFumigadas: aNumero(p.hasFumigadas),
    siembraTrilla: aNumero(p.siembraTrilla),
    bolseros: aNumero(p.bolseros),
    etiquetado: aNumero(p.etiquetado),
    cargaCamionKg50: p.cargaCamionKg50 ?? null,
    cargaCamionKg25: p.cargaCamionKg25 ?? null,
    cargaCamionOtro: p.cargaCamionOtro ?? null,
    movimientoEstibaKg50: p.movimientoEstibaKg50 ?? null,
    movimientoEstibaKg25: p.movimientoEstibaKg25 ?? null,
    movimientoEstibaOtro: p.movimientoEstibaOtro ?? null,
    // Ojo: TODAS estas columnas son NUMERIC y llegan como TEXTO ("3", no 3).
    // Sin aNumero, sumarlas las concatena y fmtNumero directamente explota
    // porque un string no tiene .toFixed().
    etiquetadoLata185: aNumero(p.etiquetadoLata185),
    etiquetadoLata750: aNumero(p.etiquetadoLata750),
    etiquetadoLata2500: aNumero(p.etiquetadoLata2500),
    etiquetadoLata8kg: aNumero(p.etiquetadoLata8kg),
    descargaJaula: aNumero(p.descargaJaula),
    descargaCamion: aNumero(p.descargaCamion),
    cargaJaula: aNumero(p.cargaJaula),
    cargaCamionCantidad: aNumero(p.cargaCamionCantidad),
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
        cosecha: totales.cosecha + cosechaDeItem(it.minutesWorked, it.tipos),
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
  { slug: 'tantero', etiqueta: 'Tantero' },
  { slug: 'abonada', etiqueta: 'Abonada' },
  { slug: 'cajas_cajones', etiqueta: 'Cajas y cajones' },
  { slug: 'km_viajes', etiqueta: 'Km / Viajes' },
  { slug: 'has_fumigadas', etiqueta: 'Has fumigadas' },
  { slug: 'siembra_trilla', etiqueta: 'Siembra / Trilla' },
  { slug: 'bolseros', etiqueta: 'Bolseros' },
  { slug: 'etiquetado', etiqueta: 'Etiquetado' },
  { slug: 'descarga', etiqueta: 'Descarga' },
  { slug: 'carga', etiqueta: 'Carga' },
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
      // Las tarjas nuevas no llevan "C:" en el texto: la cosecha esta en sus
      // columnas. Con el chequeo viejo el filtro no mostraba ninguna.
      return (
        partes.some((p) => p === 'C' || p.startsWith('C:')) ||
        t.cosechaCanadas !== null ||
        t.cosechaInv !== null ||
        t.cosechaBananas !== null
      );
    case 'tantero':
      return t.tanteroInvernadero !== null || t.tanteroCampo !== null;
    case 'descarga':
      return t.descargaJaula !== null || t.descargaCamion !== null;
    case 'carga':
      return t.cargaJaula !== null || t.cargaCamionCantidad !== null;
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
