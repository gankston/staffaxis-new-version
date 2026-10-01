/**
 * Lectura del codigo de barras PDF417 del FRENTE del DNI argentino (esta al
 * lado de la firma; el dorso solo tiene la huella y el domicilio).
 *
 * Ojo: no es un QR. Es el codigo ancho de barras finas que esta abajo del todo
 * en el reverso de la tarjeta. Adentro viene el mismo dato que esta impreso,
 * separado por "@".
 *
 * Formato de la tarjeta actual (desde ~2012):
 *   00123456789@APELLIDO@NOMBRES@M@12345678@A@01/01/1980@01/01/2016@123
 *      tramite  apellido nombres  sexo  dni  ejemplar  nacimiento  emision
 *
 * Conviven ejemplares mas viejos con el orden cambiado, asi que ademas del
 * caso normal hay una pasada de rescate que busca el DNI por forma.
 */

import { marcarPaso } from '../lib/rastro';

export interface DatosDni {
  dni: string;
  apellido: string;
  nombre: string;
  sexo: string | null;
  fechaNacimiento: string | null;
  /** El contenido crudo, por si hay que revisar un ejemplar raro. */
  crudo: string;
}

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** Mismo criterio que la validacion del servidor: 7 a 9 digitos. */
const pareceDni = (s: string) => /^\d{7,9}$/.test(soloDigitos(s)) && soloDigitos(s).length >= 7;

const pareceTexto = (s: string) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,}$/.test(s.trim());

const limpiarNombre = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export function parsearDni(crudo: string): DatosDni | null {
  if (!crudo || !crudo.trim()) return null;
  const partes = crudo.split('@').map((p) => p.trim());

  // Caso normal: tramite, apellido, nombres, sexo, dni, ...
  if (partes.length >= 5 && pareceDni(partes[4]) && pareceTexto(partes[1]) && pareceTexto(partes[2])) {
    return {
      dni: soloDigitos(partes[4]),
      apellido: limpiarNombre(partes[1]),
      nombre: limpiarNombre(partes[2]),
      sexo: partes[3] || null,
      fechaNacimiento: partes[6] || null,
      crudo,
    };
  }

  // Rescate: el DNI es el primer campo con forma de DNI que no sea el nro de
  // tramite (que es mas largo), y los nombres son los dos textos que lo rodean.
  const idxDni = partes.findIndex((p, i) => i > 0 && pareceDni(p));
  if (idxDni === -1) return null;

  const textos = partes.filter((p, i) => i !== idxDni && pareceTexto(p));
  if (textos.length < 2) return null;

  return {
    dni: soloDigitos(partes[idxDni]),
    apellido: limpiarNombre(textos[0]),
    nombre: limpiarNombre(textos[1]),
    sexo: partes.find((p) => /^[MF]$/i.test(p)) ?? null,
    fechaNacimiento: partes.find((p) => /^\d{2}\/\d{2}\/\d{4}$/.test(p)) ?? null,
    crudo,
  };
}

/** Nada puede quedar colgado: el tipo esta parado mirando la pantalla. */
function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

/**
 * Decodifica el PDF417 de una foto. Se prueba primero el BarcodeDetector del
 * sistema (lo trae el WebView de Android y es mucho mas rapido); si no esta,
 * cae a ZXing, que se carga solo en ese momento para no engordar el bundle.
 *
 * ESTA FUNCION NO TIRA NUNCA Y NO SE CUELGA NUNCA. Antes, si la imagen no
 * cargaba, la promesa de cargarImagen se quedaba sin resolver ni rechazar y la
 * pantalla quedaba en "Leyendo..." para siempre; y si rechazaba, la excepcion
 * salia para arriba y dejaba la pantalla trabada igual.
 */
export async function leerPdf417(dataUrl: string): Promise<string | null> {
  marcarPaso('escaneo: abriendo la foto');
  const img = await conTope(cargarImagen(dataUrl), 15_000);
  if (!img) return null;

  // El orden esta pensado con 60 fotos reales de altas:
  //
  // 1) ZXing, pero solo los intentos BARATOS (foto entera, contraste, ampliada,
  //    girada). Leen el 80% de las fotos en ~0,3 s, y asi el lector del sistema
  //    ni se toca en la mayoria de los casos.
  marcarPaso('escaneo: leyendo con ZXing');
  const rapido = await conTope(conZxing(img, lienzosRapidos(img), 8_000), 12_000);
  if (rapido) return rapido;

  // 2) El lector del sistema de Android. Es el que mejor lee fotos de camara:
  //    va SEGUNDO y no ultimo. Cuando iba despues de toda la grilla de abajo, el
  //    encargado esperaba hasta 15 segundos mirando "Leyendo..." antes de que
  //    llegara a probar el lector que si lo leia.
  marcarPaso('escaneo: lector de codigos de Android');
  const nativo = await conTope(conDetectorDelSistema(img), 15_000);
  if (nativo) return nativo;

  // 3) Ultimo recurso: recortes ampliados (DNI chico en el cuadro). Es lo caro.
  marcarPaso('escaneo: ZXing con recortes');
  return await conTope(conZxing(img, lienzosRecortes(img), 12_000), 16_000);
}

/**
 * Una lectura solo vale si es un DNI de verdad.
 *
 * ZXing a veces no falla: DEVUELVE BASURA. Probado con 60 fotos reales de altas,
 * 4 dieron cosas como "0070437834‹üTORRES—b>ÞOS FABIANG(Q4910)(2=àìý·/1J©". Antes
 * eso se aceptaba como lectura, el encargado veia "no tiene el formato del DNI",
 * y el lector de Android -que lo hubiera leido bien- ni llegaba a probar.
 *
 * Por eso dos filtros: que no haya ningun caracter raro (el codigo del DNI es
 * texto comun separado por @), y que se pueda interpretar como DNI. Y como los
 * datos escaneados quedan BLOQUEADOS en el formulario, no puede pasar nada que
 * el encargado despues no pueda corregir.
 */
const SOLO_TEXTO_DNI = /^[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ@/ .,'-]+$/;

function lecturaValida(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = texto.trim();
  if (!SOLO_TEXTO_DNI.test(t)) return null;
  if (!parsearDni(t)) return null;
  return estructuraCoherente(t) ? t : null;
}

const FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const fechaReal = (s: string) => {
  const m = FECHA.exec(s.trim());
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return d >= 1 && d <= 31 && mes >= 1 && mes <= 12 && a >= 1900 && a <= 2100;
};

/**
 * Una lectura rota puede quedar con todos los caracteres "limpios" y aun asi
 * traer cualquier cosa: un DNI con los numeros cambiados, un nombre a medias.
 * Paso de verdad: el 23/09 se dio de alta "CASTILLO NILDA CQ STINA" con el DNI
 * 30118275, y la foto guardada es el DNI 29059538 de CASTILLO CRISTINA, que ya
 * existia. Quedo la misma persona dos veces, una con un DNI ajeno.
 *
 * El codigo del DNI tiene una estructura fija, y una lectura corrupta casi
 * siempre rompe alguno de sus campos:
 *   tramite(11 digitos)@APELLIDO@NOMBRES@SEXO@DNI@EJEMPLAR@NACIMIENTO@EMISION@...
 * En los ejemplares viejos el orden cambia, asi que ahi se exige lo minimo que
 * todos traen: una fecha real y el sexo.
 */
function estructuraCoherente(t: string): boolean {
  const p = t.split('@').map((x) => x.trim());
  const formatoNuevo = p.length >= 8 && /^\d{11}$/.test(p[0]);
  if (formatoNuevo) {
    return (
      /^[MFX]$/i.test(p[3]) &&
      /^\d{7,9}$/.test(p[4]) &&
      /^[A-Z]$/i.test(p[5]) &&
      fechaReal(p[6]) &&
      fechaReal(p[7])
    );
  }
  return p.some(fechaReal) && p.some((x) => /^[MFX]$/i.test(x));
}

async function conDetectorDelSistema(img: HTMLImageElement): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formatos = await Detector.getSupportedFormats?.();
    if (formatos && !formatos.includes('pdf417')) return null;
    const encontrados = await new Detector({ formats: ['pdf417'] }).detect(img);
    for (const e of encontrados) {
      const v = lecturaValida(e.rawValue);
      if (v) return v;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ZXing, pero por la API baja y NO por BrowserPDF417Reader.
 *
 * Esto no es capricho. BrowserPDF417Reader arma el BinaryBitmap con
 * HybridBinarizer y no deja cambiarlo, y con una foto de verdad de un DNI —
 * plastificado, con reflejos, apoyado en un carton — Hybrid no encuentra el
 * codigo NUNCA. Probado con la foto que no entraba:
 *
 *   BrowserPDF417Reader (Hybrid)          -> no lee
 *   PDF417Reader + Hybrid + TRY_HARDER    -> no lee
 *   PDF417Reader + GlobalHistogram        -> lee en 32 ms
 *
 * Hybrid divide la imagen en bloques y calcula un umbral por bloque: sirve
 * cuando la luz cae despareja sobre un papel, pero los reflejos del plastico le
 * ensucian los bloques justo donde estan las barras. Global saca un unico
 * umbral de todo el histograma y esos brillos no lo mueven.
 *
 * Igual quedan los dos: Global primero, Hybrid despues, porque en una foto con
 * sombra fuerte de un lado puede ganar Hybrid.
 */
async function conZxing(
  img: HTMLImageElement,
  lienzos: Generator<HTMLCanvasElement | null>,
  topeMs: number,
): Promise<string | null> {
  let z: typeof import('@zxing/library');
  try {
    marcarPaso('escaneo: bajando el lector ZXing');
    z = await import('@zxing/library');
  } catch {
    return null;
  }
  const hints = new Map();
  hints.set(z.DecodeHintType.TRY_HARDER, true);
  hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.PDF_417]);

  // Tope de tiempo REAL. Sin esto, con una foto sin codigo recorre todos los
  // intentos: en la PC eran 10 segundos, en un telefono puede ser el triple.
  const limite = performance.now() + topeMs;
  let intento = 0;
  void img;
  for (const lienzo of lienzos) {
    if (!lienzo) continue;
    if (performance.now() > limite) break;
    // Se le devuelve el control a la pantalla entre intento e intento. El
    // decodificador es sincronico: encadenando decenas de intentos sin soltar,
    // la pantalla quedaba congelada ("Leyendo..." quieto) y Android puede
    // tirar el cartel de "la app no responde".
    await new Promise((r) => setTimeout(r, 0));
    marcarPaso(`escaneo: ZXing, pasada ${++intento}`, `${lienzo.width}x${lienzo.height}`);
    for (const Binarizador of [z.GlobalHistogramBinarizer, z.HybridBinarizer]) {
      try {
        const mapa = new z.BinaryBitmap(
          new Binarizador(new z.HTMLCanvasElementLuminanceSource(lienzo)),
        );
        const texto = lecturaValida(new z.PDF417Reader().decode(mapa, hints).getText());
        if (texto) {
          lienzo.width = 0;
          lienzo.height = 0;
          return texto;
        }
      } catch {
        /* esta combinacion no lo encontro, se prueba la siguiente */
      }
    }
    // Se suelta la memoria del canvas ya, sin esperar al recolector: son
    // decenas de intentos y en un telefono chico se acumulan.
    lienzo.width = 0;
    lienzo.height = 0;
  }
  return null;
}

/**
 * Las versiones de la foto que se le dan al lector, de la mas barata a la mas
 * cara. Se arman de a una y a medida que se piden: tener tres canvas grandes
 * vivos al mismo tiempo es justo lo que hace que Android mate la pantalla.
 */
function* lienzosRapidos(img: HTMLImageElement): Generator<HTMLCanvasElement | null> {
  // La foto entera, derecha. Es lo que alcanza casi siempre.
  yield aLienzo(img, { escala: 1 });
  // Contraste estirado: levanta los codigos lavados (foto a una pantalla).
  yield aLienzo(img, { escala: 1, contraste: true });
  // Ampliada, para cuando las barras quedan de menos de un pixel.
  yield aLienzo(img, { escala: 2 });
  // Girada. En el campo la foto se saca con el telefono parado y el DNI
  // acostado, y el codigo queda VERTICAL: ZXing no lo busca de costado.
  // Probado con el DNI de Serrano: derecha no sale, girada 90 si.
  yield aLienzo(img, { rotacion: 90 });
  yield aLienzo(img, { rotacion: 270 });
}

/**
 * Recortes ampliados. Cuando el DNI es una parte chica de la foto (con la mano,
 * el fondo, un reflejo encima), el lector no encuentra el codigo en el cuadro
 * entero pero si en un pedazo agrandado. Probado con el DNI de Cruz: entera no
 * sale en ninguna rotacion, recortada y ampliada si. Es lo mas caro: va al final.
 */
function* lienzosRecortes(img: HTMLImageElement): Generator<HTMLCanvasElement | null> {
  for (const rotacion of [0, 90]) {
    // Ventanas de medio ancho por un cuarto de alto, que se pisan a la mitad;
    // primero la franja del medio y de abajo, que es donde suele caer el codigo.
    const [fw, fh] = [0.5, 0.25];
    const ys: number[] = [];
    for (let y = 0; y + fh <= 1.001; y += fh / 2) ys.push(y);
    ys.sort((a, b) => Math.abs(a + fh / 2 - 0.6) - Math.abs(b + fh / 2 - 0.6));
    for (const y of ys) {
      for (let x = 0; x + fw <= 1.001; x += fw / 2) {
        yield aLienzo(img, { rotacion, recorte: [x, y, fw, fh], escala: 2, contraste: true });
      }
    }
  }
}

/** Tope de pixeles del canvas, para no volver a quedarnos sin memoria. */
const PIXELES_MAXIMOS = 8_000_000;

interface OpcionesLienzo {
  escala?: number;
  contraste?: boolean;
  /** Grados: 0, 90, 180 o 270. */
  rotacion?: number;
  /** Pedazo de la foto a usar, en fracciones: [x, y, ancho, alto]. */
  recorte?: [number, number, number, number];
}

function aLienzo(img: HTMLImageElement, o: OpcionesLienzo): HTMLCanvasElement | null {
  try {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    if (!W || !H) return null;
    const [fx, fy, fw, fh] = o.recorte ?? [0, 0, 1, 1];
    const sx = fx * W, sy = fy * H, sw = fw * W, sh = fh * H;
    const rot = ((o.rotacion ?? 0) % 360 + 360) % 360;
    const deCostado = rot === 90 || rot === 270;
    // Tope de pixeles: tener canvas gigantes es justo lo que hace que Android
    // mate la pantalla.
    const tope = Math.sqrt(PIXELES_MAXIMOS / (sw * sh));
    const e = Math.min(o.escala ?? 1, Math.max(0.1, tope));
    const c = document.createElement('canvas');
    c.width = Math.round((deCostado ? sh : sw) * e);
    c.height = Math.round((deCostado ? sw : sh) * e);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, sx, sy, sw, sh, (-sw * e) / 2, (-sh * e) / 2, sw * e, sh * e);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (o.contraste) estirarContraste(ctx, c.width, c.height);
    return c;
  } catch {
    return null;
  }
}

/** Blanco y negro con el contraste abierto de punta a punta. */
function estirarContraste(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const datos = ctx.getImageData(0, 0, w, h);
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
    const v = Math.max(0, Math.min(255, ((p[i] - min) / rango) * 255));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(datos, 0, 0);
}


interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): { detect(src: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
  getSupportedFormats?(): Promise<string[]>;
}

function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = dataUrl;
  });
}
