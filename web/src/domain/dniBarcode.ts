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

  // 1) ZXing PRIMERO, y el lector del sistema despues. El orden es al reves de
  //    lo que parece razonable (el del sistema es nativo y mas rapido) y esta
  //    asi a proposito:
  //
  //    el BarcodeDetector de Android no es javascript, es una llamada a Google
  //    Play Services. Si esa llamada se cae, no hay try/catch que valga: se
  //    lleva puesto el proceso del WebView, o sea la app entera, al instante y
  //    sin dejar ningun error. Y es el UNICO paso de todo el escaneo que no se
  //    puede probar desde la PC, porque ahi BarcodeDetector no existe.
  //
  //    ZXing lee las fotos de verdad en menos de medio segundo (probado con la
  //    que venia fallando: 53 ms), asi que poniendolo adelante el camino nativo
  //    directamente no se pisa salvo que ZXing no pueda.
  marcarPaso('escaneo: leyendo con ZXing');
  const zxing = await conTope(conZxing(img), 30_000);
  if (zxing) return zxing;

  marcarPaso('escaneo: lector de codigos de Android');
  return await conTope(conDetectorDelSistema(img), 15_000);
}

async function conDetectorDelSistema(img: HTMLImageElement): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formatos = await Detector.getSupportedFormats?.();
    if (formatos && !formatos.includes('pdf417')) return null;
    const encontrados = await new Detector({ formats: ['pdf417'] }).detect(img);
    return encontrados[0]?.rawValue ?? null;
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
async function conZxing(img: HTMLImageElement): Promise<string | null> {
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

  let intento = 0;
  for (const lienzo of lienzosAProbar(img)) {
    if (!lienzo) continue;
    marcarPaso(`escaneo: ZXing, pasada ${++intento}`, `${lienzo.width}x${lienzo.height}`);
    for (const Binarizador of [z.GlobalHistogramBinarizer, z.HybridBinarizer]) {
      try {
        const mapa = new z.BinaryBitmap(
          new Binarizador(new z.HTMLCanvasElementLuminanceSource(lienzo)),
        );
        const texto = new z.PDF417Reader().decode(mapa, hints).getText();
        if (texto) return texto;
      } catch {
        /* esta combinacion no lo encontro, se prueba la siguiente */
      }
    }
  }
  return null;
}

/**
 * Las versiones de la foto que se le dan al lector, de la mas barata a la mas
 * cara. Se arman de a una y a medida que se piden: tener tres canvas grandes
 * vivos al mismo tiempo es justo lo que hace que Android mate la pantalla.
 */
function* lienzosAProbar(img: HTMLImageElement): Generator<HTMLCanvasElement | null> {
  yield aLienzo(img, 1, false);
  // Contraste estirado: levanta los codigos lavados (foto a una pantalla).
  yield aLienzo(img, 1, true);
  // Ampliada, para cuando el documento es una parte chica del cuadro y las
  // barras quedan de menos de un pixel.
  yield aLienzo(img, 2, false);
}

/** Tope de pixeles del canvas, para no volver a quedarnos sin memoria. */
const PIXELES_MAXIMOS = 8_000_000;

function aLienzo(img: HTMLImageElement, escala: number, contraste: boolean): HTMLCanvasElement | null {
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return null;
    const tope = Math.sqrt(PIXELES_MAXIMOS / (w0 * h0));
    const e = Math.min(escala, Math.max(0.1, tope));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * e);
    c.height = Math.round(h0 * e);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (contraste) estirarContraste(ctx, c.width, c.height);
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
