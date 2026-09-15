/**
 * Port exacto de TiposCargaNuevos (domain/model/Models.kt).
 *
 * Tipos de carga nuevos (km_viajes, bolseros, carga_camion, etc.) — cada uno con
 * columna propia en el servidor, igual que horas/cosecha/cajas/cajones/importe.
 * 50kg/25kg son checks: el dato ES el peso, no una cantidad a ingresar.
 */
export interface TiposCargaNuevos {
  kmViajes: number | null;
  hasFumigadas: number | null;
  siembraTrilla: number | null;
  bolseros: number | null;
  etiquetado: number | null;
  cargaCamionKg50: boolean | null;
  cargaCamionKg25: boolean | null;
  cargaCamionOtro: string | null;
  movimientoEstibaKg50: boolean | null;
  movimientoEstibaKg25: boolean | null;
  movimientoEstibaOtro: string | null;
  // Etiquetado abierto por tamaño de lata
  etiquetadoLata185: number | null;
  etiquetadoLata750: number | null;
  etiquetadoLata2500: number | null;
  etiquetadoLata8kg: number | null;
  // Descarga y Carga, solo FABRICA: cuantas jaulas y cuantos camiones
  descargaJaula: number | null;
  descargaCamion: number | null;
  cargaJaula: number | null;
  cargaCamionCantidad: number | null;
}

export const TIPOS_NUEVOS_VACIO: TiposCargaNuevos = {
  kmViajes: null,
  hasFumigadas: null,
  siembraTrilla: null,
  bolseros: null,
  etiquetado: null,
  cargaCamionKg50: null,
  cargaCamionKg25: null,
  cargaCamionOtro: null,
  movimientoEstibaKg50: null,
  movimientoEstibaKg25: null,
  movimientoEstibaOtro: null,
  etiquetadoLata185: null,
  etiquetadoLata750: null,
  etiquetadoLata2500: null,
  etiquetadoLata8kg: null,
  descargaJaula: null,
  descargaCamion: null,
  cargaJaula: null,
  cargaCamionCantidad: null,
};

export function estaVacio(t: TiposCargaNuevos): boolean {
  return (
    t.kmViajes === null &&
    t.hasFumigadas === null &&
    t.siembraTrilla === null &&
    t.bolseros === null &&
    t.etiquetado === null &&
    t.cargaCamionKg50 === null &&
    t.cargaCamionKg25 === null &&
    t.cargaCamionOtro === null &&
    t.movimientoEstibaKg50 === null &&
    t.movimientoEstibaKg25 === null &&
    t.movimientoEstibaOtro === null &&
    t.etiquetadoLata185 === null &&
    t.etiquetadoLata750 === null &&
    t.etiquetadoLata2500 === null &&
    t.etiquetadoLata8kg === null &&
    t.descargaJaula === null &&
    t.descargaCamion === null &&
    t.cargaJaula === null &&
    t.cargaCamionCantidad === null
  );
}

// Para totales de periodo: los numericos se suman, los checks de camion/estiba
// quedan en true si aparecieron cualquier dia, "otro" se queda con el primero.
function sumarNum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function oCualquiera(a: boolean | null, b: boolean | null): boolean | null {
  return a === true || b === true ? true : null;
}

export function sumarTipos(a: TiposCargaNuevos, b: TiposCargaNuevos): TiposCargaNuevos {
  return {
    kmViajes: sumarNum(a.kmViajes, b.kmViajes),
    hasFumigadas: sumarNum(a.hasFumigadas, b.hasFumigadas),
    siembraTrilla: sumarNum(a.siembraTrilla, b.siembraTrilla),
    bolseros: sumarNum(a.bolseros, b.bolseros),
    etiquetado: sumarNum(a.etiquetado, b.etiquetado),
    cargaCamionKg50: oCualquiera(a.cargaCamionKg50, b.cargaCamionKg50),
    cargaCamionKg25: oCualquiera(a.cargaCamionKg25, b.cargaCamionKg25),
    cargaCamionOtro: a.cargaCamionOtro ?? b.cargaCamionOtro,
    movimientoEstibaKg50: oCualquiera(a.movimientoEstibaKg50, b.movimientoEstibaKg50),
    movimientoEstibaKg25: oCualquiera(a.movimientoEstibaKg25, b.movimientoEstibaKg25),
    movimientoEstibaOtro: a.movimientoEstibaOtro ?? b.movimientoEstibaOtro,
    etiquetadoLata185: sumarNum(a.etiquetadoLata185, b.etiquetadoLata185),
    etiquetadoLata750: sumarNum(a.etiquetadoLata750, b.etiquetadoLata750),
    etiquetadoLata2500: sumarNum(a.etiquetadoLata2500, b.etiquetadoLata2500),
    etiquetadoLata8kg: sumarNum(a.etiquetadoLata8kg, b.etiquetadoLata8kg),
    descargaJaula: sumarNum(a.descargaJaula, b.descargaJaula),
    descargaCamion: sumarNum(a.descargaCamion, b.descargaCamion),
    cargaJaula: sumarNum(a.cargaJaula, b.cargaJaula),
    cargaCamionCantidad: sumarNum(a.cargaCamionCantidad, b.cargaCamionCantidad),
  };
}

export function sumarLista(lista: TiposCargaNuevos[]): TiposCargaNuevos {
  return lista.reduce(sumarTipos, TIPOS_NUEVOS_VACIO);
}
