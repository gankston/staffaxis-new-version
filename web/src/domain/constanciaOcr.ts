/**
 * Lectura de la "Constancia de solicitud de tramite DNI" del RENAPER, la hoja
 * que le dan al que tiene el documento en tramite.
 *
 * Ojo: esa hoja NO trae los datos en ningun codigo. El codigo de barras de
 * arriba es el numero de boleta y el QR de abajo es un link de seguimiento;
 * la hoja misma aclara que "no acredita identidad". Asi que el apellido, el
 * nombre y el DNI hay que sacarlos del texto impreso, y por eso esta carga
 * SIEMPRE queda editable: el reconocimiento de texto se equivoca, y el DNI
 * argentino no tiene digito verificador que avise.
 */

export type DatosConstancia = {
  dni: string;
  apellido: string;
  nombre: string;
  idTramite: string | null;
};

/** Saca el texto de la foto. Primero el lector del sistema, que no pesa nada. */
export async function leerTextoDeFoto(dataUrl: string): Promise<string | null> {
  const nativo = await conTextDetector(dataUrl);
  if (nativo && nativo.trim().length > 40) return nativo;
  return conTesseract(dataUrl);
}

async function conTextDetector(dataUrl: string): Promise<string | null> {
  const D = (window as unknown as { TextDetector?: new () => { detect: (b: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).TextDetector;
  if (!D) return null;
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const bloques = await new D().detect(bitmap);
    bitmap.close();
    return bloques.map((b) => b.rawValue).join('\n');
  } catch {
    return null;
  }
}

/** Respaldo para los telefonos sin lector de texto propio. Se baja al usarlo. */
async function conTesseract(dataUrl: string): Promise<string | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    // Servidos por nosotros, no por un CDN: en el campo la red es mala y ademas
    // asi quedan cacheados con el resto del bundle.
    const ocr = `${import.meta.env.BASE_URL}ocr`;
    const worker = await createWorker('eng', 1, {
      workerPath: `${ocr}/worker.min.js`,
      corePath: `${ocr}/tesseract-core-simd-lstm.wasm.js`,
      langPath: ocr,
      gzip: true,
    });
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();
    return data.text ?? null;
  } catch {
    return null;
  }
}

const soloDigitos = (s: string) => s.replace(/[^0-9]/g, '');

/** Saca apellido, nombre y DNI del texto de la constancia. */
export function parsearConstancia(texto: string): DatosConstancia | null {
  const limpio = texto.replace(/ /g, ' ');

  // "DNI N° 29459626" — el OCR mete puntos y espacios en cualquier lado
  let dni = '';
  for (const re of [
    /DNI\s*N?\s*[°ºo0]?\s*:?\s*([0-9][0-9.\s]{5,13})/i,
    /D\.?N\.?I\.?\s*:?\s*([0-9][0-9.\s]{5,13})/i,
  ]) {
    const m = limpio.match(re);
    if (m) {
      const d = soloDigitos(m[1]);
      if (d.length >= 7 && d.length <= 9) { dni = d; break; }
    }
  }

  // "MOLINA, Diego Ariel" — apellido en mayusculas, coma, nombres
  let apellido = '', nombre = '';
  const mNom = limpio.match(
    /^[^\S\n]*([A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ'´\s]{2,40}?)\s*,\s*([A-Za-zÑñÁÉÍÓÚÜáéíóúü'´\s]{2,40})[^\S\n]*$/m,
  );
  if (mNom) {
    apellido = mNom[1].replace(/\s+/g, ' ').trim().toUpperCase();
    nombre = mNom[2].replace(/\s+/g, ' ').trim().toUpperCase();
  }

  const mTram = limpio.match(/Idtramite\s*:?\s*\(?\s*([0-9]{6,12})/i);

  if (!dni && !apellido) return null;
  return { dni, apellido, nombre, idTramite: mTram ? mTram[1] : null };
}
