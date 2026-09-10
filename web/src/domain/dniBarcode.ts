/**
 * Lectura del codigo de barras PDF417 del DORSO del DNI argentino.
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

/**
 * Decodifica el PDF417 de una foto. Se prueba primero el BarcodeDetector del
 * sistema (lo trae el WebView de Android y es mucho mas rapido); si no esta,
 * cae a ZXing, que se carga solo en ese momento para no engordar el bundle.
 */
export async function leerPdf417(dataUrl: string): Promise<string | null> {
  const img = await cargarImagen(dataUrl);

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
    const r = await lector.decodeFromImageElement(img);
    return r?.getText() ?? null;
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
