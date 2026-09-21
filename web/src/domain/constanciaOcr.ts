/**
 * Lectura de la "Constancia de solicitud de tramite DNI" del RENAPER, la hoja
 * que le dan al que tiene el documento en tramite.
 *
 * Esa hoja NO trae los datos en ningun codigo: el de barras de arriba es el
 * numero de boleta y el QR de abajo un link de seguimiento, y la hoja misma
 * aclara que "no acredita identidad". Asi que hay que leer el texto impreso.
 *
 * En una foto real el sello redondo cae justo encima del renglon del nombre,
 * asi que el apellido sale casi siempre y el nombre muchas veces no. Preferimos
 * dejar el campo vacio antes que completarlo con lo que salga: el que carga
 * tiene el papel en la mano y lo escribe, pero un nombre inventado por el
 * lector puede pasar sin que nadie lo mire.
 */

export type DatosConstancia = {
  dni: string;
  apellido: string;
  nombre: string;
  idTramite: string | null;
};

type Preparacion = 'crudo' | 'umbral' | 'gris';

/** Lee la constancia probando variantes hasta sacar algo usable. */
export async function leerConstancia(dataUrl: string): Promise<DatosConstancia | null> {
  let mejor: DatosConstancia | null = null;

  // 1) El lector del sistema sobre la foto tal cual. No pesa nada y en los
  //    telefonos que lo tienen es el que mejor anda con fotos de verdad.
  const nativo = await conTextDetector(dataUrl);
  mejor = elMejor(mejor, nativo ? parsearConstancia(nativo) : null);
  if (completo(mejor)) return mejor;

  // 2) Tesseract sobre la imagen preparada. El umbral es el que mejor separa
  //    la tinta del papel celeste; el gris queda de respaldo. El lector se crea
  //    UNA sola vez: crearlo dos veces lo rompe y deja la promesa colgada.
  let worker: TesseractWorker | null = null;
  try {
    worker = await conTope(crearLector(), 90_000);
    if (!worker) return mejor;
    for (const modo of ['umbral', 'gris'] as Preparacion[]) {
      const img = (await conTope(preparar(dataUrl, modo), 20_000)) ?? dataUrl;
      const texto = await conTope(reconocer(worker, img), 60_000);
      mejor = elMejor(mejor, texto ? parsearConstancia(texto) : null);
      if (completo(mejor)) break;
    }
  } catch {
    /* si el lector falla queda lo que haya sacado el del sistema */
  } finally {
    try { await worker?.terminate(); } catch { /* ya estaba cerrado */ }
  }
  return mejor;
}

/** Nada puede quedar colgado para siempre: el tipo esta parado en el campo. */
function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const completo = (d: DatosConstancia | null) => !!d && !!d.dni && !!d.apellido && !!d.nombre;

/** Entre dos lecturas se queda con la que trajo mas campos. */
function elMejor(a: DatosConstancia | null, b: DatosConstancia | null): DatosConstancia | null {
  if (!a) return b;
  if (!b) return a;
  const puntos = (d: DatosConstancia) => (d.dni ? 4 : 0) + (d.apellido ? 2 : 0) + (d.nombre ? 1 : 0);
  const ganador = puntos(b) > puntos(a) ? b : a;
  const otro = ganador === a ? b : a;
  return {
    dni: ganador.dni || otro.dni,
    apellido: ganador.apellido || otro.apellido,
    nombre: ganador.nombre || otro.nombre,
    idTramite: ganador.idTramite ?? otro.idTramite,
  };
}

/**
 * Deja la foto en blanco y negro con el contraste estirado. En la hoja celeste
 * del RENAPER, sacada con la camara de un telefono, esto cambia bastante lo que
 * el lector llega a reconocer.
 */
async function preparar(dataUrl: string, modo: Preparacion): Promise<string> {
  if (modo === 'crudo') return dataUrl;
  try {
    // createImageBitmap y no <img>.decode(): decode() no resuelve nunca si la
    // pantalla no se esta dibujando (app en segundo plano), y dejaba el alta
    // colgada para siempre.
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const escala = Math.min(2, 2200 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * escala);
    c.height = Math.round(bitmap.height * escala);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bitmap.close(); return dataUrl; }
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();

    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const p = datos.data;
    for (let i = 0; i < p.length; i += 4) {
      const v = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    // estira el contraste descartando el 2% de cada punta
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[p[i] | 0]++;
    const total = c.width * c.height;
    let acum = 0;
    let bajo = 0;
    let alto = 255;
    for (let v = 0; v < 256; v++) {
      acum += hist[v];
      if (acum > total * 0.02) { bajo = v; break; }
    }
    acum = 0;
    for (let v = 255; v >= 0; v--) {
      acum += hist[v];
      if (acum > total * 0.02) { alto = v; break; }
    }
    const rango = Math.max(1, alto - bajo);
    for (let i = 0; i < p.length; i += 4) {
      let v = Math.max(0, Math.min(255, ((p[i] - bajo) / rango) * 255));
      if (modo === 'umbral') v = v < 140 ? 0 : 255;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(datos, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

async function conTextDetector(dataUrl: string): Promise<string | null> {
  const D = (window as unknown as {
    TextDetector?: new () => { detect: (b: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
  }).TextDetector;
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

type TesseractWorker = {
  recognize: (img: string) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

/** Respaldo para los telefonos sin lector propio. Se baja al usarlo. */
async function crearLector(): Promise<TesseractWorker | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    // Servidos por nosotros, no por un CDN: en el campo la red es mala y ademas
    // asi quedan cacheados con el resto del bundle.
    const ocr = `${import.meta.env.BASE_URL}ocr`;
    return (await createWorker('eng', 1, {
      workerPath: `${ocr}/worker.min.js`,
      corePath: `${ocr}/tesseract-core-simd-lstm.wasm.js`,
      langPath: ocr,
      gzip: true,
    })) as unknown as TesseractWorker;
  } catch {
    return null;
  }
}

async function reconocer(worker: TesseractWorker, dataUrl: string): Promise<string | null> {
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text ?? null;
  } catch {
    return null;
  }
}

/**
 * Si la palabra esta en mayusculas. La ñ cuenta como mayuscula aunque venga
 * minuscula: el RENAPER imprime el apellido todo en mayusculas MENOS la ñ
 * ("CAñAMERO", "MUñOZ"), asi que con el chequeo comun el apellido se cortaba
 * justo en la ñ y volvia vacio.
 */
function enMayusculas(palabra: string): boolean {
  const conEnie = palabra.replace(/ñ/g, 'Ñ');
  return conEnie === conEnie.toUpperCase();
}

/** Saca apellido, nombre, DNI y numero de tramite del texto reconocido. */
export function parsearConstancia(texto: string): DatosConstancia | null {
  const limpio = texto.replace(/ /g, ' ');

  // "DNI N° 29459626". El lector escribe cualquier cosa entre la sigla y los
  // digitos ("DNIN®", "DNI N?", "D.N.I:"), asi que no se exige nada en el medio.
  let dni = '';
  const mDni = limpio.match(/D\s*\.?\s*N\s*\.?\s*I[^0-9]{0,10}?([0-9][0-9.\s]{5,13})/i);
  if (mDni) {
    const d = mDni[1].replace(/[^0-9]/g, '');
    if (d.length >= 7 && d.length <= 9) dni = d;
  }

  // El nombre SOLO se busca despues de "Certifico que el/la Sr./a". Sin esa
  // ancla no se adivina: arriba esta el encabezado, todo en mayusculas, y el
  // lector termina tomando "AL INICIAR ESTE NUEVO TRAMITE" como apellido.
  let apellido = '';
  let nombre = '';
  const mAncla = limpio.match(
    /Certifico\s+que\s+e[l1][/ ]?[l1]a\s+Sr\.?\s*\.?\/?\s*a\s*[:-]?\s*([^\n]{3,80})/i,
  );
  if (mAncla) {
    const tokens = mAncla[1]
      .replace(/[^A-Za-zÑñÁÉÍÓÚÜáéíóúü,\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.replace(/,/g, '').length >= 2);

    // En la hoja el formato es "APELLIDO, Nombres": el apellido es la tira de
    // palabras en mayuscula y la coma la corta. Si la coma no aparece justo ahi
    // es que el sello comio el renglon, y entonces el nombre se deja vacio.
    const ape: string[] = [];
    let cerroConComa = false;
    let i = 0;
    for (; i < tokens.length; i++) {
      const bruto = tokens[i];
      const palabra = bruto.replace(/,/g, '');
      if (!enMayusculas(palabra)) break;
      ape.push(palabra);
      if (bruto.includes(',')) { i++; cerroConComa = true; break; }
    }
    if (ape.length) {
      apellido = ape.join(' ').toUpperCase();
      if (cerroConComa) {
        nombre = tokens
          .slice(i)
          .map((t) => t.replace(/,/g, ''))
          .join(' ')
          .toUpperCase()
          .trim();
      }
    }
  }

  const mTram = limpio.match(/Idtramite\s*:?\s*\(?\s*([0-9]{6,12})/i);
  if (!dni && !apellido) return null;
  return { dni, apellido, nombre, idTramite: mTram ? mTram[1] : null };
}
