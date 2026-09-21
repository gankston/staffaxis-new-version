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
  const img = await conTope(cargarImagen(dataUrl), 15_000);
  if (!img) return null;

  // Primero la foto tal cual. Si no sale, una segunda pasada en blanco y negro
  // con el contraste estirado: es lo que salva las fotos sacadas a una pantalla,
  // donde el codigo sale lavado y con el brillo del monitor encima.
  const bn = await conTope(enBlancoYNegro(img), 10_000);
  for (const fuente of [img, bn]) {
    if (!fuente) continue;
    const r = await conTope(unaPasada(fuente), 30_000);
    if (r) return r;
  }
  return null;
}

async function unaPasada(img: HTMLImageElement | HTMLCanvasElement): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Detector) {
    try {
      const formatos = await Detector.getSupportedFormats?.();
      if (!formatos || formatos.includes('pdf417')) {
        const det = new Detector({ formats: ['pdf417'] });
        const encontrados = await det.detect(img);
        if (encontrados.length > 0 && encontrados[0].rawValue) return encontrados[0].rawValue;
      }
    } catch {
      /* si el detector del sistema falla, sigue ZXing */
    }
  }

  try {
    const { BrowserPDF417Reader } = await import('@zxing/library');
    const lector = new BrowserPDF417Reader();
    // ZXing solo lee de un <img>: si le llega un canvas, se le pasa como uno.
    const elemento =
      img instanceof HTMLCanvasElement ? await cargarImagen(img.toDataURL('image/png')) : img;
    const r = await lector.decodeFromImageElement(elemento);
    return r?.getText() ?? null;
  } catch {
    return null;
  }
}

/**
 * Blanco y negro con el contraste estirado, sin achicar. Misma receta que usa
 * el lector de la constancia, que en fotos de verdad cambia bastante lo que se
 * llega a reconocer.
 */
async function enBlancoYNegro(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    if (!c.width || !c.height) return null;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
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
      const v = Math.max(0, Math.min(255, ((p[i] - min) / rango) * 255));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(datos, 0, 0);
    return c;
  } catch {
    return null;
  }
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
