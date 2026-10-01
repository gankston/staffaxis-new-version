/**
 * Lectura del DORSO del DNI: las tres lineas de abajo con "<<<" (la "zona de
 * lectura mecanica", MRZ, el mismo formato que los pasaportes).
 *
 * Es lo que hay que leer en el DNI NUEVO: ese ya no tiene el codigo de barras
 * en el frente, y el QR de atras es tan denso que con una foto de telefono no
 * se puede leer. Las lineas con "<<<" las traen tambien los DNI tarjeta de
 * antes, asi que sirve para los dos.
 *
 *   IDARG39398163<0<<<<<<<<<<<<<<<     tipo, pais, DNI + digito verificador
 *   9512265M4012162ARG<<<<<<<<<<<0     nacimiento + dig, sexo, vencimiento + dig
 *   AROBIA<<HECTOR<RENE<<<<<<<<<<<     APELLIDO<<NOMBRES
 *
 * Lo bueno: el DNI, el nacimiento y el vencimiento traen DIGITO VERIFICADOR.
 * Si el lector se equivoca en un numero, la cuenta no da y la lectura se
 * descarta. Por eso el DNI que sale de aca se puede bloquear en el formulario.
 *
 * Lo malo: el nombre NO tiene verificador, viene sin Ñ (CAÑAMERO sale CANAMERO)
 * y si es largo viene cortado a 30 letras. Por eso nombre y apellido quedan
 * editables.
 */

import { marcarPaso } from '../lib/rastro';

export interface DatosDorso {
  dni: string;
  apellido: string;
  nombre: string;
  sexo: string | null;
  /** DD/MM/AAAA, como lo devuelve el codigo del frente. */
  fechaNacimiento: string | null;
}

/** Valor de cada caracter para el digito verificador (norma ICAO 9303). */
const valor = (ch: string) => (ch === '<' ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);

/** Digito verificador ICAO: pesos 7, 3, 1 repetidos, modulo 10. */
export const digitoVerificador = (s: string) =>
  String([...s].reduce((a, ch, i) => a + valor(ch) * [7, 3, 1][i % 3], 0) % 10);

/**
 * En un campo que SOLO puede tener numeros, las confusiones tipicas del lector
 * se corrigen solas (la O por 0, la I por 1...). Si quedara mal, el digito
 * verificador no da y se descarta igual.
 */
const aDigitos = (s: string) =>
  s
    .replace(/[OQDU]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/T/g, '7')
    .replace(/B/g, '8');

const fechaValida = (aammdd: string) => {
  const mes = Number(aammdd.slice(2, 4));
  const dia = Number(aammdd.slice(4, 6));
  return /^\d{6}$/.test(aammdd) && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
};

/** "951226" -> "26/12/1995". El siglo sale de que nadie nace en el futuro. */
function fechaNacimiento(aammdd: string): string {
  const aa = Number(aammdd.slice(0, 2));
  const hoy = new Date().getFullYear() % 100;
  const siglo = aa > hoy ? 1900 : 2000;
  return `${aammdd.slice(4, 6)}/${aammdd.slice(2, 4)}/${siglo + aa}`;
}

/**
 * Linea 1: "IDARG" + numero de documento (9 lugares, el DNI y relleno con <)
 * + digito verificador. Devuelve el DNI solo si el verificador da.
 */
function leerLinea1(linea: string): string | null {
  const i = linea.indexOf('ARG');
  if (i < 0 || i > 4) return null;
  const resto = linea.slice(i + 3);
  // El DNI tiene 7 u 8 digitos; despues del numero, relleno hasta 9 lugares.
  for (const largo of [8, 7]) {
    const numero = aDigitos(resto.slice(0, largo));
    if (!/^\d+$/.test(numero) || numero.length !== largo) continue;
    // El relleno es "<", pero el lector a veces lo ve como otra letra.
    const relleno = resto.slice(largo, 9);
    if (/\d/.test(relleno)) continue;
    const campo = numero + '<'.repeat(9 - largo);
    const verificador = aDigitos(resto.charAt(9));
    if (digitoVerificador(campo) === verificador) return numero;
  }
  return null;
}

/** Linea 2: nacimiento + dig, sexo, vencimiento + dig, "ARG". */
function leerLinea2(linea: string): { nacimiento: string; sexo: string | null } | null {
  const i = linea.indexOf('ARG', 13);
  if (i < 15) return null;
  const ini = i - 15;
  const nac = aDigitos(linea.slice(ini, ini + 6));
  const dNac = aDigitos(linea.charAt(ini + 6));
  const sexo = linea.charAt(ini + 7);
  const venc = aDigitos(linea.slice(ini + 8, ini + 14));
  const dVenc = aDigitos(linea.charAt(ini + 14));
  if (!fechaValida(nac) || !fechaValida(venc)) return null;
  if (digitoVerificador(nac) !== dNac || digitoVerificador(venc) !== dVenc) return null;
  return { nacimiento: nac, sexo: /^[MF]$/.test(sexo) ? sexo : null };
}

/**
 * Linea 3: "APELLIDO<<NOMBRE<SEGUNDO<<<<". Sin verificador: queda editable.
 *
 * El lector arranca bien el relleno "<<<" pero despues lo degrada a letras:
 * "AROBIA<<HECTOR<RENE<<LLLLLLLLKLK". Por eso el nombre termina en el primer
 * "<" despues del cual solo queda relleno (<, L o K). Se corta en un "<" y no
 * en una letra para no comerle la ultima L a MIGUEL o a ISABEL.
 */
function leerLinea3(linea: string): { apellido: string; nombre: string } | null {
  let fin = linea.length;
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] === '<' && /^[<LK]*$/.test(linea.slice(i))) {
      fin = i;
      break;
    }
  }
  // "<K<" es un "<<" con una K de mas: nadie se llama K.
  const cuerpo = linea.slice(0, fin).replace(/<K</g, '<<');
  const m = /^([A-Z][A-Z<]*?)<<+([A-Z][A-Z<]*)$/.exec(cuerpo);
  if (!m) return null;
  const limpiar = (s: string) => s.replace(/<+/g, ' ').trim();
  const apellido = limpiar(m[1]);
  const nombre = limpiar(m[2]);
  return apellido && nombre ? { apellido, nombre } : null;
}

/**
 * Saca los datos del texto que devolvio el lector. Exige que el DNI, el
 * nacimiento y el vencimiento pasen su digito verificador: si no, null.
 */
export function parsearDorso(texto: string): DatosDorso | null {
  const lineas = texto
    .toUpperCase()
    .split('\n')
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20);

  let dni: string | null = null;
  let datos2: ReturnType<typeof leerLinea2> = null;
  let datos3: ReturnType<typeof leerLinea3> = null;
  for (let k = 0; k < lineas.length; k++) {
    if (!dni) dni = leerLinea1(lineas[k]);
    if (!datos2) {
      datos2 = leerLinea2(lineas[k]);
      // El nombre es la linea que sigue a la de las fechas.
      if (datos2 && lineas[k + 1]) datos3 = leerLinea3(lineas[k + 1]);
    }
  }
  if (!dni || !datos2) return null;
  return {
    dni,
    apellido: datos3?.apellido ?? '',
    nombre: datos3?.nombre ?? '',
    sexo: datos2.sexo,
    fechaNacimiento: fechaNacimiento(datos2.nacimiento),
  };
}

type Caja = { x0: number; y0: number; x1: number; y1: number };
type Simbolo = { text: string; confidence: number; bbox: Caja };
type Renglon = { text: string; bbox: Caja; words?: Array<{ symbols?: Simbolo[] | null }> };
type Resultado = {
  data: { text?: string; blocks?: Array<{ paragraphs: Array<{ lines: Renglon[] }> }> | null };
};
type Lector = {
  recognize: (img: HTMLCanvasElement, opciones?: object, salida?: object) => Promise<Resultado>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const simbolosDe = (l: Renglon) => (l.words ?? []).flatMap((w) => w.symbols ?? []);
const centro = (s: Simbolo) => (s.bbox.x0 + s.bbox.x1) / 2;

/**
 * La linea del nombre, armada por POSICION.
 *
 * El lector de texto se equivoca con el "<" de dos maneras:
 *  - lo parte en dos: "<" y una K o S pegada ("HECTOR<KRENE", "JUAN<SMANUEL")
 *  - lo lee como letra: "GRECIA" K "MARCELA"
 * Pero las tres lineas usan una letra de ancho fijo: cada renglon son 30
 * casilleros iguales, y cada letra cae justo en el suyo. Asi que:
 *  - la grilla se saca de la linea de las fechas, que sale siempre limpia;
 *  - un casillero con un "<", o con dos simbolos, es un "<";
 *  - una K, S, L o C leida con menos confianza que el resto del nombre, es un
 *    "<" mal leido (en las fotos probadas: 87-92 contra 99 de las letras).
 */
function lineaNombrePorPosicion(r: Resultado): string | null {
  const renglones = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  const limpio = (t: string) => t.toUpperCase().replace(/[^A-Z0-9<]/g, '');
  const i2 = renglones.findIndex((l) => leerLinea2(limpio(l.text)));
  const l2 = renglones[i2];
  const l3 = renglones[i2 + 1];
  if (!l2 || !l3) return null;

  // Los primeros 18 casilleros de la linea 2 (fechas, sexo, "ARG") son numeros
  // y letras claras: con eso se ajusta la grilla, posicion = a + b * casillero.
  const s2 = simbolosDe(l2).slice(0, 18);
  if (s2.length < 18) return null;
  let sk = 0, sx = 0, skk = 0, skx = 0;
  s2.forEach((s, k) => {
    const x = centro(s);
    sk += k;
    sx += x;
    skk += k * k;
    skx += k * x;
  });
  const b = (18 * skx - sk * sx) / (18 * skk - sk * sk);
  const a = (sx - b * sk) / 18;
  if (!(b > 3)) return null;
  // Si algun caracter no cae en su casillero, la grilla no es confiable.
  if (s2.some((s, k) => Math.abs(centro(s) - (a + b * k)) > 0.3 * b)) return null;

  const s3 = simbolosDe(l3);
  const confianzas = s3.filter((s) => /^[A-Z]$/.test(s.text)).map((s) => s.confidence).sort((x, y) => x - y);
  const mediana = confianzas[confianzas.length >> 1] ?? 0;

  const casilleros: Simbolo[][] = Array.from({ length: 30 }, () => []);
  for (const s of s3) {
    const k = Math.round((centro(s) - a) / b);
    if (k >= 0 && k < 30) casilleros[k].push(s);
  }
  const base = casilleros.map((c) => {
    if (c.length !== 1 || c[0].text === '<') return '<';
    return /^[A-Z]$/.test(c[0].text) ? c[0].text : '<';
  });
  // La K o S dudosa solo se toma como "<" si esta ENTRE dos letras (un
  // separador mal leido). Al final de un nombre es una letra de verdad: la S de
  // ANDRES o de INES.
  return base
    .map((ch, k) => {
      const s = casilleros[k][0];
      const entreLetras = /[A-Z]/.test(base[k - 1] ?? '') && /[A-Z]/.test(base[k + 1] ?? '');
      if (s && 'KSLC'.includes(ch) && s.confidence < mediana - 5 && entreLetras) return '<';
      return ch;
    })
    .join('');
}

/**
 * Lo que quede raro despues de todo se deja VACIO: el que carga tiene el DNI en
 * la mano y lo escribe, pero un nombre con basura puede pasar sin que nadie lo
 * mire. Se descartan las letras sueltas (restos de un nombre cortado).
 */
function nombreConfiable(s: string): string {
  const palabras = s.split(' ').filter((p) => p.length > 1);
  if (palabras.some((p) => /[^A-Z]|KK|LLL/.test(p))) return '';
  return palabras.join(' ');
}

/** Nada puede quedar colgado: el tipo esta parado mirando la pantalla. */
function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function crearLector(): Promise<Lector | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    // Los mismos archivos que usa la constancia, servidos por nosotros.
    const ocr = `${import.meta.env.BASE_URL}ocr`;
    const w = (await createWorker('eng', 1, {
      workerPath: `${ocr}/worker.min.js`,
      corePath: `${ocr}/tesseract-core-simd-lstm.wasm.js`,
      langPath: ocr,
      gzip: true,
    })) as unknown as Lector;
    // Solo lo que puede aparecer en esas lineas. Lo demas del dorso (el
    // domicilio, el QR) sale como basura y el parser lo ignora.
    await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
    return w;
  } catch {
    return null;
  }
}

/** Lado largo con el que se lee. Probado con fotos de la camara (1600). */
const LADO = 1600;

/** La foto girada, en blanco y negro y con el contraste abierto. */
function prepararGirada(bitmap: ImageBitmap, rotacion: number): HTMLCanvasElement | null {
  try {
    const e = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * e);
    const h = Math.round(bitmap.height * e);
    const deCostado = rotacion === 90 || rotacion === 270;
    const c = document.createElement('canvas');
    c.width = deCostado ? h : w;
    c.height = deCostado ? w : h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotacion * Math.PI) / 180);
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const p = datos.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < p.length; i += 4) {
      const v = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
      p[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const rango = Math.max(1, max - min);
    for (let i = 0; i < p.length; i += 4) {
      const v = ((p[i] - min) / rango) * 255;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(datos, 0, 0);
    return c;
  } catch {
    return null;
  }
}

/**
 * Lee el dorso del DNI. No tira nunca y no se cuelga nunca.
 *
 * No se sabe para que lado esta la foto, asi que se prueba girada. Primero los
 * giros mas probables: una foto parada de un DNI acostado tiene las lineas de
 * costado.
 */
export async function leerDorsoDni(dataUrl: string): Promise<DatosDorso | null> {
  let bitmap: ImageBitmap | null = null;
  let lector: Lector | null = null;
  try {
    marcarPaso('dorso: abriendo la foto');
    // createImageBitmap y no <img>.decode(): decode() no resuelve nunca si la
    // pantalla no se esta dibujando.
    bitmap = await conTope(createImageBitmap(await (await fetch(dataUrl)).blob()), 15_000);
    if (!bitmap) return null;

    marcarPaso('dorso: cargando el lector de texto');
    lector = await conTope(crearLector(), 90_000);
    if (!lector) return null;

    // En las fotos reales probadas, las paradas venian casi siempre con las
    // lineas sobre el costado izquierdo (giro 270).
    const parada = bitmap.height > bitmap.width;
    const giros = parada ? [270, 90, 0, 180] : [0, 180, 90, 270];
    for (const giro of giros) {
      marcarPaso('dorso: leyendo las lineas <<<', `giro ${giro}`);
      const lienzo = prepararGirada(bitmap, giro);
      if (!lienzo) continue;
      const r = await conTope(lector.recognize(lienzo, {}, { text: true, blocks: true }), 30_000);
      lienzo.width = lienzo.height = 0;
      const datos = r?.data.text ? parsearDorso(r.data.text) : null;
      if (!r || !datos) continue;

      // El DNI ya esta verificado. El nombre se arma por posicion (ver
      // lineaNombrePorPosicion); si no se puede, queda lo que salio del texto.
      const linea = lineaNombrePorPosicion(r);
      if (linea) marcarPaso('dorso: nombre por posicion', linea);
      const n = (linea ? leerLinea3(linea) : null) ?? { apellido: datos.apellido, nombre: datos.nombre };
      return { ...datos, apellido: nombreConfiable(n.apellido), nombre: nombreConfiable(n.nombre) };
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
    try {
      await lector?.terminate();
    } catch {
      /* ya estaba cerrado */
    }
  }
}
