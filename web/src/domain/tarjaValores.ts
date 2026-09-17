/**
 * Port exacto de domain/model/TarjaValores.kt.
 *
 * El campo `minutesWorked` guarda un formato compuesto
 * ("H 8|C:33|Cajas 23 Cajones 55|AB:47573,53") y este es el UNICO lugar donde se
 * interpreta, igual que en la app Kotlin.
 */

export interface TarjaValores {
  horas: number;
  cosecha: number;
  cajas: number;
  cajones: number;
  abonada: number;
}

export const CERO: TarjaValores = { horas: 0, cosecha: 0, cajas: 0, cajones: 0, abonada: 0 };

const REGEX_CAJAS = /Cajas ([0-9]+(?:[.,][0-9]+)?)/;
const REGEX_CAJONES = /Cajones ([0-9]+(?:[.,][0-9]+)?)/;

// Equivalente a Kotlin `s?.trim()?.replace(',', '.')?.toFloatOrNull() ?: 0f`.
// Ojo: toFloatOrNull es ESTRICTO (una cadena como "12abc" da null, no 12), asi que
// no alcanza con parseFloat — de ahi el chequeo con regex antes de convertir.
function num(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0;
  const limpio = s.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(limpio)) return 0;
  const n = parseFloat(limpio);
  return Number.isNaN(n) ? 0 : n;
}

export function parse(minutesWorked: string | null | undefined): TarjaValores {
  if (minutesWorked === null || minutesWorked === undefined || minutesWorked.trim() === '') return CERO;

  let horas = 0;
  let cosecha = 0;
  let cajas = 0;
  let cajones = 0;
  let abonada = 0;

  for (const parte of minutesWorked.split('|').map((p) => p.trim())) {
    if (parte.startsWith('H ')) {
      horas += num(parte.slice(2));
    } else if (parte.startsWith('C:')) {
      cosecha += num(parte.slice(2));
    } else if (parte === 'C') {
      // cosecha vieja, sin cantidad de cachos
    } else if (parte.startsWith('AB:')) {
      abonada += num(parte.slice(3));
    } else if (parte.startsWith('$')) {
      // Formato viejo: la abonada sola, escrita con el signo adelante.
      abonada += num(parte.slice(1));
    } else if (parte.startsWith('Cajas') || parte.startsWith('Cajones')) {
      // Kotlin usa .toInt(), que TRUNCA hacia cero (no redondea).
      cajas += Math.trunc(num(REGEX_CAJAS.exec(parte)?.[1]));
      cajones += Math.trunc(num(REGEX_CAJONES.exec(parte)?.[1]));
    } else {
      const n = num(parte);
      // Datos viejos: si el numero plano es > 16 estaba guardado en minutos.
      if (n > 0) horas += n > 16 ? n / 60 : n;
    }
  }

  return { horas, cosecha, cajas, cajones, abonada };
}

export function sumarValores(a: TarjaValores, b: TarjaValores): TarjaValores {
  return {
    horas: a.horas + b.horas,
    cosecha: a.cosecha + b.cosecha,
    cajas: a.cajas + b.cajas,
    cajones: a.cajones + b.cajones,
    abonada: a.abonada + b.abonada,
  };
}

export function sumar(valores: Array<string | null | undefined>): TarjaValores {
  return valores.reduce<TarjaValores>((acc, mw) => sumarValores(acc, parse(mw)), CERO);
}

/**
 * Cosecha de un registro. Desde que se abrio en Cañadas / Raigon-Inv el dato vive
 * en sus columnas y el "C:" dejo de escribirse, asi que hay que mirar los dos
 * lados: el texto para las tarjas viejas y las columnas para las nuevas.
 *
 * No se duplica: una tarja vieja tiene el texto y los subtipos en null, y una
 * nueva tiene los subtipos y ningun "C:".
 */
export function cosechaDe(
  minutesWorked: string | null | undefined,
  t?: { cosechaCanadas: number | null; cosechaInv: number | null } | null,
): number {
  return parse(minutesWorked).cosecha + (t?.cosechaCanadas ?? 0) + (t?.cosechaInv ?? 0);
}
