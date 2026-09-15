/**
 * Lectura del campo compuesto `minutes_worked` del lado del servidor.
 *
 * El formato es "H 8|C:33|Cajas 23 Cajones 55|AB:47573.53" y hasta ahora solo
 * se interpretaba en la app. Esto existe para dos cosas:
 *
 *  1. Normalizar el separador decimal al guardar (coma -> punto).
 *  2. Completar las columnas tipadas cuando el telefono no las manda, para que
 *     un reporte que lea solo las columnas no salga corto y en silencio.
 *
 * Una diferencia a proposito con TarjaValores.kt: la app hace `.toInt()` sobre
 * cajas y cajones, que TRUNCA. Aca se devuelve el valor tal cual esta escrito,
 * porque el que decide si se puede guardar sin perder nada es quien escribe en
 * la columna, no este parser.
 */

/** Equivalente a `toFloatOrNull` de Kotlin: estricto, "12abc" da null. */
function num(s) {
  if (s === null || s === undefined) return null;
  const limpio = String(s).trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(limpio)) return null;
  const n = Number.parseFloat(limpio);
  return Number.isNaN(n) ? null : n;
}

const RE_CAJAS = /Cajas\s*([0-9]+(?:[.,][0-9]+)?)/i;
const RE_CAJONES = /Cajones\s*([0-9]+(?:[.,][0-9]+)?)/i;

/**
 * Pasa las comas decimales a punto. Solo toca la coma que esta ENTRE digitos:
 * una coma suelta en un texto libre no se toca.
 *
 * Los dos separadores conviven en la base desde siempre porque el teclado
 * numerico de Android, en un telefono en español, escribe coma. Todos los
 * lectores aceptan las dos formas, pero el Excel abierto en español lee "31.08"
 * como 3108, y mientras convivan no hay export que salga derecho.
 */
export function normalizarSeparadorDecimal(texto) {
  if (typeof texto !== 'string') return texto;
  return texto.replace(/(\d),(\d)/g, '$1.$2');
}

/**
 * Devuelve lo que el texto dice, y ademas QUE conceptos nombra. Esa distincion
 * importa: una tarja de horas puras no habla de cosecha, y ahi la columna tiene
 * que quedar en NULL y no en 0, que significan cosas distintas.
 */
export function parseMinutesWorked(minutesWorked) {
  const vacio = {
    horas: null, cosecha: null, cajas: null, cajones: null, abonada: null,
  };
  if (typeof minutesWorked !== 'string' || minutesWorked.trim() === '') return vacio;

  let horas = null;
  let cosecha = null;
  let cajas = null;
  let cajones = null;
  let abonada = null;
  const sumar = (acc, v) => (v === null ? acc : (acc ?? 0) + v);

  for (const parte of minutesWorked.split('|').map((p) => p.trim())) {
    if (parte.startsWith('H ')) {
      horas = sumar(horas, num(parte.slice(2)));
    } else if (parte.startsWith('C:')) {
      cosecha = sumar(cosecha, num(parte.slice(2)));
    } else if (parte === 'C') {
      // cosecha vieja, sin cantidad: no aporta ningun numero
    } else if (parte.startsWith('AB:')) {
      // Hay partes viejas escritas "AB:$ 10200": se le saca el signo y el espacio.
      // Cuando trae una tarea en vez de un numero ("AB:limpieza") queda en null,
      // que es lo correcto: no hay cantidad que guardar.
      abonada = sumar(abonada, num(parte.slice(3).replace(/^\s*\$\s*/, '')));
    } else if (parte.startsWith('$')) {
      // Formato viejo: la abonada sola, escrita con el signo adelante.
      abonada = sumar(abonada, num(parte.slice(1)));
    } else if (/^Cajas|^Cajones/i.test(parte)) {
      const c = num(RE_CAJAS.exec(parte)?.[1]);
      const j = num(RE_CAJONES.exec(parte)?.[1]);
      if (c !== null) cajas = sumar(cajas, c);
      if (j !== null) cajones = sumar(cajones, j);
    } else {
      const n = num(parte);
      // Datos viejos: un numero plano mayor a 16 estaba guardado en minutos.
      if (n !== null && n > 0) horas = sumar(horas, n > 16 ? n / 60 : n);
    }
  }

  return { horas, cosecha, cajas, cajones, abonada };
}

const esEntero = (n) => n !== null && Number.isFinite(n) && Number.isInteger(n);

/**
 * Completa los campos tipados que el cliente no mando, leyendolos del texto.
 * Lo que el cliente SI manda no se toca nunca: manda el cliente.
 *
 * `cajas` y `cajones` son columnas INTEGER, asi que solo se completan cuando el
 * valor es entero. Con "Cajas 27.57" se dejan en NULL a proposito: guardar 28
 * seria meter un numero equivocado en la base de la que sale el sueldo, y el
 * valor exacto sigue estando entero en el texto. Cuando esas columnas pasen a
 * numeric, se completan solas.
 */
export function completarTipados(minutesWorked, enviado) {
  const leido = parseMinutesWorked(minutesWorked);
  const tomar = (delCliente, delTexto) => (delCliente === undefined || delCliente === null ? delTexto : delCliente);

  return {
    horas: tomar(enviado.horas, leido.horas),
    cosecha: tomar(enviado.cosecha, leido.cosecha),
    abonada: tomar(enviado.abonada, leido.abonada),
    cajas: tomar(enviado.cajas, esEntero(leido.cajas) ? leido.cajas : null),
    cajones: tomar(enviado.cajones, esEntero(leido.cajones) ? leido.cajones : null),
  };
}
