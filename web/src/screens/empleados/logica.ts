/**
 * Port exacto de las reglas de EmpleadosViewModel.kt: armado del string
 * compuesto minutes_worked, campos tipados, validaciones y el parseo inverso
 * para editar un registro ya cargado.
 */
import type { TiposCargaNuevos } from '../../domain/tiposCarga';

/** Kotlin: "H " + (if (h % 1f == 0f) h.toInt() else h) */
export function formatHorasValue(h: number): string {
  return 'H ' + (h % 1 === 0 ? String(Math.trunc(h)) : String(h));
}

/** Muestra el numero sin ".0" cuando es entero (fmtValor del ViewModel). */
export function fmtValor(v: number): string {
  return v === Math.trunc(v) ? String(Math.trunc(v)) : String(v);
}

/** Kotlin toFloatOrNull: estricto, "12abc" -> null (no 12). */
export function toFloatOrNull(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

/** Kotlin toIntOrNull: solo digitos con signo opcional, sin decimales. */
export function toIntOrNull(s: string): number | null {
  const t = s.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

const comaAPunto = (s: string) => s.trim().replace(',', '.');

export function buildCajasCajonesSegment(
  porCajas: boolean,
  cajas: string,
  porCajones: boolean,
  cajones: string,
): string {
  let out = '';
  if (porCajas) out += `Cajas ${cajas.trim()}`;
  if (porCajas && porCajones) out += ' ';
  if (porCajones) out += `Cajones ${cajones.trim()}`;
  return out;
}

/** Estado compartido por el dialogo de carga y el de edicion. */
export interface ValoresCarga {
  horas: number;
  porCosecha: boolean;
  cachosCount: string;
  porAbonada: boolean;
  abonadaValor: string;
  porCajas: boolean;
  cajasCount: string;
  porCajones: boolean;
  cajonesCount: string;
  porKm: boolean;
  kmValor: string;
  porHasFumigadas: boolean;
  hasFumigadasValor: string;
  porSiembraTrilla: boolean;
  siembraTrillaValor: string;
  porBolseros: boolean;
  bolserosValor: string;
  porEtiquetado: boolean;
  etiquetadoLata185: string;
  etiquetadoLata750: string;
  etiquetadoLata2500: string;
  etiquetadoLata8kg: string;
  // Descarga y Carga (FABRICA): se tilda el tipo, despues jaula y/o camion, y
  // cada uno tildado pide su cantidad.
  porDescarga: boolean;
  descargaJaulaCheck: boolean;
  descargaJaulaValor: string;
  descargaCamionCheck: boolean;
  descargaCamionValor: string;
  porCarga: boolean;
  cargaJaulaCheck: boolean;
  cargaJaulaValor: string;
  cargaCamionCheck: boolean;
  cargaCamionValor: string;
  porCargaCamion: boolean;
  cargaCamion50: boolean;
  cargaCamion25: boolean;
  cargaCamionOtroCheck: boolean;
  cargaCamionOtro: string;
  porMovimientoEstiba: boolean;
  movimientoEstiba50: boolean;
  movimientoEstiba25: boolean;
  movimientoEstibaOtroCheck: boolean;
  movimientoEstibaOtro: string;
}

export const VALORES_CARGA_INICIAL: ValoresCarga = {
  horas: 8,
  porCosecha: false,
  cachosCount: '',
  porAbonada: false,
  abonadaValor: '',
  porCajas: false,
  cajasCount: '',
  porCajones: false,
  cajonesCount: '',
  porKm: false,
  kmValor: '',
  porHasFumigadas: false,
  hasFumigadasValor: '',
  porSiembraTrilla: false,
  siembraTrillaValor: '',
  porBolseros: false,
  bolserosValor: '',
  porEtiquetado: false,
  etiquetadoLata185: '',
  etiquetadoLata750: '',
  etiquetadoLata2500: '',
  etiquetadoLata8kg: '',
  porDescarga: false,
  descargaJaulaCheck: false,
  descargaJaulaValor: '',
  descargaCamionCheck: false,
  descargaCamionValor: '',
  porCarga: false,
  cargaJaulaCheck: false,
  cargaJaulaValor: '',
  cargaCamionCheck: false,
  cargaCamionValor: '',
  porCargaCamion: false,
  cargaCamion50: false,
  cargaCamion25: false,
  cargaCamionOtroCheck: false,
  cargaCamionOtro: '',
  porMovimientoEstiba: false,
  movimientoEstiba50: false,
  movimientoEstiba25: false,
  movimientoEstibaOtroCheck: false,
  movimientoEstibaOtro: '',
};

/**
 * Misma condicion que el `enabled` del boton Guardar y que los `return` de
 * guardarHoras()/guardarEdicionRegistro(): cada tipo tildado exige su valor.
 */
export function puedeGuardar(v: ValoresCarga): boolean {
  if (v.porCosecha && !v.cachosCount.trim()) return false;
  if (v.porAbonada && !v.abonadaValor.trim()) return false;
  if (v.porCajas && !v.cajasCount.trim()) return false;
  if (v.porCajones && !v.cajonesCount.trim()) return false;
  if (v.porKm && !v.kmValor.trim()) return false;
  if (v.porHasFumigadas && !v.hasFumigadasValor.trim()) return false;
  if (v.porSiembraTrilla && !v.siembraTrillaValor.trim()) return false;
  if (v.porBolseros && !v.bolserosValor.trim()) return false;
  // Etiquetado: alcanza con que haya cargado una lata, no las cuatro.
  if (
    v.porEtiquetado &&
    !v.etiquetadoLata185.trim() &&
    !v.etiquetadoLata750.trim() &&
    !v.etiquetadoLata2500.trim() &&
    !v.etiquetadoLata8kg.trim()
  )
    return false;
  // Descarga y Carga: hay que tildar al menos una opcion, y la tildada pide numero.
  if (v.porDescarga) {
    if (!v.descargaJaulaCheck && !v.descargaCamionCheck) return false;
    if (v.descargaJaulaCheck && !v.descargaJaulaValor.trim()) return false;
    if (v.descargaCamionCheck && !v.descargaCamionValor.trim()) return false;
  }
  if (v.porCarga) {
    if (!v.cargaJaulaCheck && !v.cargaCamionCheck) return false;
    if (v.cargaJaulaCheck && !v.cargaJaulaValor.trim()) return false;
    if (v.cargaCamionCheck && !v.cargaCamionValor.trim()) return false;
  }
  if (
    v.porCargaCamion &&
    !v.cargaCamion50 &&
    !v.cargaCamion25 &&
    !(v.cargaCamionOtroCheck && v.cargaCamionOtro.trim())
  )
    return false;
  if (
    v.porMovimientoEstiba &&
    !v.movimientoEstiba50 &&
    !v.movimientoEstiba25 &&
    !(v.movimientoEstibaOtroCheck && v.movimientoEstibaOtro.trim())
  )
    return false;
  return true;
}

/** minutes_worked: si queda una sola parte va sola, si no se unen con "|". */
export function buildMinutesWorked(v: ValoresCarga): string {
  const parts: string[] = [formatHorasValue(v.horas)];
  if (v.porCosecha) parts.push(`C:${v.cachosCount.trim()}`);
  if (v.porAbonada) parts.push(`AB:${v.abonadaValor.trim()}`);
  const cajasCajones = buildCajasCajonesSegment(v.porCajas, v.cajasCount, v.porCajones, v.cajonesCount);
  if (cajasCajones.trim()) parts.push(cajasCajones);
  return parts.length === 1 ? parts[0] : parts.join('|');
}

export function buildTiposNuevos(v: ValoresCarga): TiposCargaNuevos {
  return {
    kmViajes: v.porKm ? toFloatOrNull(comaAPunto(v.kmValor)) : null,
    hasFumigadas: v.porHasFumigadas ? toFloatOrNull(comaAPunto(v.hasFumigadasValor)) : null,
    siembraTrilla: v.porSiembraTrilla ? toFloatOrNull(comaAPunto(v.siembraTrillaValor)) : null,
    bolseros: v.porBolseros ? toFloatOrNull(comaAPunto(v.bolserosValor)) : null,
    // `etiquetado` queda para lo viejo; ahora el dato va abierto por lata.
    etiquetado: null,
    etiquetadoLata185: v.porEtiquetado ? toFloatOrNull(comaAPunto(v.etiquetadoLata185)) : null,
    etiquetadoLata750: v.porEtiquetado ? toFloatOrNull(comaAPunto(v.etiquetadoLata750)) : null,
    etiquetadoLata2500: v.porEtiquetado ? toFloatOrNull(comaAPunto(v.etiquetadoLata2500)) : null,
    etiquetadoLata8kg: v.porEtiquetado ? toFloatOrNull(comaAPunto(v.etiquetadoLata8kg)) : null,
    descargaJaula: v.porDescarga && v.descargaJaulaCheck ? toFloatOrNull(comaAPunto(v.descargaJaulaValor)) : null,
    descargaCamion: v.porDescarga && v.descargaCamionCheck ? toFloatOrNull(comaAPunto(v.descargaCamionValor)) : null,
    cargaJaula: v.porCarga && v.cargaJaulaCheck ? toFloatOrNull(comaAPunto(v.cargaJaulaValor)) : null,
    cargaCamionCantidad: v.porCarga && v.cargaCamionCheck ? toFloatOrNull(comaAPunto(v.cargaCamionValor)) : null,
    cargaCamionKg50: v.porCargaCamion && v.cargaCamion50 ? true : null,
    cargaCamionKg25: v.porCargaCamion && v.cargaCamion25 ? true : null,
    cargaCamionOtro:
      v.porCargaCamion && v.cargaCamionOtroCheck && v.cargaCamionOtro.trim()
        ? v.cargaCamionOtro.trim()
        : null,
    movimientoEstibaKg50: v.porMovimientoEstiba && v.movimientoEstiba50 ? true : null,
    movimientoEstibaKg25: v.porMovimientoEstiba && v.movimientoEstiba25 ? true : null,
    movimientoEstibaOtro:
      v.porMovimientoEstiba && v.movimientoEstibaOtroCheck && v.movimientoEstibaOtro.trim()
        ? v.movimientoEstibaOtro.trim()
        : null,
  };
}

/** Campos tipados que acompanian al string (cosecha/cajas/cajones/abonada). */
export function buildTipados(v: ValoresCarga) {
  return {
    cosecha: v.porCosecha ? toFloatOrNull(comaAPunto(v.cachosCount)) : null,
    cajas: v.porCajas ? toIntOrNull(v.cajasCount) : null,
    cajones: v.porCajones ? toIntOrNull(v.cajonesCount) : null,
    abonada: v.porAbonada ? toFloatOrNull(comaAPunto(v.abonadaValor)) : null,
  };
}

const RE_CAJAS = /Cajas ([0-9]+(?:[.,][0-9]+)?)/;
const RE_CAJONES = /Cajones ([0-9]+(?:[.,][0-9]+)?)/;

/**
 * abrirEdicionRegistro(): reconstruye el estado del formulario desde un
 * registro ya guardado. El string se parsea; los tipos nuevos vienen tipados.
 */
export function valoresDesdeRegistro(
  minutesWorked: string | null,
  t: TiposCargaNuevos,
): ValoresCarga {
  const parts = minutesWorked ? minutesWorked.split('|') : [];

  const cosechaPart = parts.find((p) => p === 'C' || p.startsWith('C:'));
  const abonadaPart = parts.find((p) => p.startsWith('AB:'));
  const esCosecha = cosechaPart !== undefined;
  const cachosCount = cosechaPart?.startsWith('C:') ? cosechaPart.slice(2) : '';
  const esAbonada = abonadaPart !== undefined;
  const abonadaValor = abonadaPart ? abonadaPart.slice(3) : '';

  const cajasCajonesPart = parts.find((p) => p.startsWith('Cajas ') || p.startsWith('Cajones '));
  const cajasMatch = cajasCajonesPart ? RE_CAJAS.exec(cajasCajonesPart) : null;
  const cajonesMatch = cajasCajonesPart ? RE_CAJONES.exec(cajasCajonesPart) : null;

  const horasPartNuevo = parts.find((p) => p.startsWith('H '));
  const horasPartViejo = parts.find((p) => toFloatOrNull(p) !== null);
  const esCajas = cajasMatch !== null;
  const esCajones = cajonesMatch !== null;
  const horas =
    (horasPartNuevo ? toFloatOrNull(horasPartNuevo.slice(2)) : null) ??
    (horasPartViejo ? toFloatOrNull(horasPartViejo) : null) ??
    (esCosecha || esAbonada || esCajas || esCajones
      ? 0
      : (minutesWorked ? toFloatOrNull(minutesWorked) : null) ?? 8);

  return {
    horas,
    porCosecha: esCosecha,
    cachosCount,
    porAbonada: esAbonada,
    abonadaValor,
    porCajas: esCajas,
    cajasCount: cajasMatch?.[1] ?? '',
    porCajones: esCajones,
    cajonesCount: cajonesMatch?.[1] ?? '',
    porKm: t.kmViajes !== null,
    kmValor: t.kmViajes !== null ? fmtValor(t.kmViajes) : '',
    porHasFumigadas: t.hasFumigadas !== null,
    hasFumigadasValor: t.hasFumigadas !== null ? fmtValor(t.hasFumigadas) : '',
    porSiembraTrilla: t.siembraTrilla !== null,
    siembraTrillaValor: t.siembraTrilla !== null ? fmtValor(t.siembraTrilla) : '',
    porBolseros: t.bolseros !== null,
    bolserosValor: t.bolseros !== null ? fmtValor(t.bolseros) : '',
    // Se abre el bloque si hay alguna lata cargada, o si es una tarja vieja que
    // guardo el etiquetado en un solo numero: ese cae en Lata 185 para que se
    // pueda ver y corregir, en vez de desaparecer al editar.
    porEtiquetado:
      t.etiquetadoLata185 !== null || t.etiquetadoLata750 !== null ||
      t.etiquetadoLata2500 !== null || t.etiquetadoLata8kg !== null || t.etiquetado !== null,
    etiquetadoLata185:
      t.etiquetadoLata185 !== null ? fmtValor(t.etiquetadoLata185)
      : t.etiquetado !== null ? fmtValor(t.etiquetado) : '',
    etiquetadoLata750: t.etiquetadoLata750 !== null ? fmtValor(t.etiquetadoLata750) : '',
    etiquetadoLata2500: t.etiquetadoLata2500 !== null ? fmtValor(t.etiquetadoLata2500) : '',
    etiquetadoLata8kg: t.etiquetadoLata8kg !== null ? fmtValor(t.etiquetadoLata8kg) : '',
    porDescarga: t.descargaJaula !== null || t.descargaCamion !== null,
    descargaJaulaCheck: t.descargaJaula !== null,
    descargaJaulaValor: t.descargaJaula !== null ? fmtValor(t.descargaJaula) : '',
    descargaCamionCheck: t.descargaCamion !== null,
    descargaCamionValor: t.descargaCamion !== null ? fmtValor(t.descargaCamion) : '',
    porCarga: t.cargaJaula !== null || t.cargaCamionCantidad !== null,
    cargaJaulaCheck: t.cargaJaula !== null,
    cargaJaulaValor: t.cargaJaula !== null ? fmtValor(t.cargaJaula) : '',
    cargaCamionCheck: t.cargaCamionCantidad !== null,
    cargaCamionValor: t.cargaCamionCantidad !== null ? fmtValor(t.cargaCamionCantidad) : '',
    porCargaCamion: t.cargaCamionKg50 === true || t.cargaCamionKg25 === true || t.cargaCamionOtro !== null,
    cargaCamion50: t.cargaCamionKg50 === true,
    cargaCamion25: t.cargaCamionKg25 === true,
    cargaCamionOtroCheck: t.cargaCamionOtro !== null,
    cargaCamionOtro: t.cargaCamionOtro ?? '',
    porMovimientoEstiba:
      t.movimientoEstibaKg50 === true || t.movimientoEstibaKg25 === true || t.movimientoEstibaOtro !== null,
    movimientoEstiba50: t.movimientoEstibaKg50 === true,
    movimientoEstiba25: t.movimientoEstibaKg25 === true,
    movimientoEstibaOtroCheck: t.movimientoEstibaOtro !== null,
    movimientoEstibaOtro: t.movimientoEstibaOtro ?? '',
  };
}

/** Filtro de la barra de busqueda: SOLO por apellido, en minusculas. */
export function filtrarEmpleados<T extends { apellido: string }>(lista: T[], q: string): T[] {
  if (!q.trim()) return lista;
  const lower = q.toLowerCase();
  return lista.filter((e) => e.apellido.toLowerCase().includes(lower));
}

/**
 * formatTiposNuevosRegistro(): los tipos nuevos en texto legible, para la lista
 * de registros del empleado.
 */
/**
 * Se usa != null a proposito: si el servidor no manda uno de estos campos llega
 * undefined, y con !== null se colaba y la pantalla mostraba "Otro: undefined"
 * en una planilla de sueldos.
 */
export function formatTiposNuevosRegistro(t: TiposCargaNuevos): string {
  const partes: string[] = [];
  if (t.kmViajes != null) partes.push(`Km ${fmtValor(t.kmViajes)}`);
  if (t.hasFumigadas != null) partes.push(`Ha ${fmtValor(t.hasFumigadas)}`);
  if (t.siembraTrilla != null) partes.push(`Siembra/Trilla ${fmtValor(t.siembraTrilla)}`);
  if (t.bolseros != null) partes.push(`Bolseros ${fmtValor(t.bolseros)}`);
  if (t.etiquetado != null) partes.push(`Etiquetado ${fmtValor(t.etiquetado)}`);
  const latas = [
    t.etiquetadoLata185 != null ? `185: ${fmtValor(t.etiquetadoLata185)}` : null,
    t.etiquetadoLata750 != null ? `750: ${fmtValor(t.etiquetadoLata750)}` : null,
    t.etiquetadoLata2500 != null ? `2500: ${fmtValor(t.etiquetadoLata2500)}` : null,
    t.etiquetadoLata8kg != null ? `8kg: ${fmtValor(t.etiquetadoLata8kg)}` : null,
  ].filter(Boolean).join(' ');
  if (latas) partes.push(`Etiquetado ${latas}`);

  const descarga = [
    t.descargaJaula != null ? `Jaula ${fmtValor(t.descargaJaula)}` : null,
    t.descargaCamion != null ? `Camión ${fmtValor(t.descargaCamion)}` : null,
  ].filter(Boolean).join(' ');
  if (descarga) partes.push(`Descarga ${descarga}`);

  const carga = [
    t.cargaJaula != null ? `Jaula ${fmtValor(t.cargaJaula)}` : null,
    t.cargaCamionCantidad != null ? `Camión ${fmtValor(t.cargaCamionCantidad)}` : null,
  ].filter(Boolean).join(' ');
  if (carga) partes.push(`Carga ${carga}`);

  const camion = [
    t.cargaCamionKg50 === true ? '50kg' : null,
    t.cargaCamionKg25 === true ? '25kg' : null,
    t.cargaCamionOtro != null ? `Otro: ${t.cargaCamionOtro}` : null,
  ].filter(Boolean).join(' ');
  if (camion.trim()) partes.push(`Carga Camión ${camion}`);

  const estiba = [
    t.movimientoEstibaKg50 === true ? '50kg' : null,
    t.movimientoEstibaKg25 === true ? '25kg' : null,
    t.movimientoEstibaOtro != null ? `Otro: ${t.movimientoEstibaOtro}` : null,
  ].filter(Boolean).join(' ');
  if (estiba.trim()) partes.push(`Mov. Estiba ${estiba}`);

  return partes.join(' + ');
}

/** formatMinutesWorkedDisplay(): el string compuesto en texto legible. */
export function formatMinutesWorkedDisplay(mw: string | null): string {
  if (!mw || !mw.trim()) return '?';
  const parts = mw.split('|');

  const horasPart = parts.find((p) => p.startsWith('H ')) ?? parts.find((p) => toFloatOrNull(p) !== null);
  const horas = horasPart
    ? horasPart.startsWith('H ')
      ? toFloatOrNull(horasPart.slice(2))
      : toFloatOrNull(horasPart)
    : null;

  const cosechaPart = parts.find((p) => p === 'C' || p.startsWith('C:'));
  const abonadaPart = parts.find((p) => p.startsWith('AB:'));
  // Formato viejo: la abonada sola, escrita con el signo adelante.
  const abonadaVieja = parts.find((p) => p.startsWith('$'));
  const cajasCajonesPart = parts.find((p) => p.startsWith('Cajas ') || p.startsWith('Cajones '));

  const piezas: string[] = [];
  if (horas !== null && horas > 0) piezas.push(horas % 1 === 0 ? `${Math.trunc(horas)}h` : `${horas}h`);
  if (cosechaPart !== undefined) {
    piezas.push(cosechaPart.startsWith('C:') ? `Cosecha ${cosechaPart.slice(2)}` : 'Cosecha');
  }
  if (abonadaPart !== undefined) piezas.push(`Abonada ${abonadaPart.slice(3)}`);
  if (abonadaVieja !== undefined) piezas.push(`Abonada ${abonadaVieja.slice(1).trim()}`);
  if (cajasCajonesPart !== undefined) piezas.push(cajasCajonesPart);

  return piezas.length === 0 ? mw : piezas.join(' + ');
}
