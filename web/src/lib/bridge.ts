/**
 * Puente entre la web y el shell nativo de Android.
 *
 * Lo que el navegador no puede hacer bien (o no de forma confiable) queda del
 * lado nativo, igual que hoy:
 *   - device_id  -> Settings.Secure.ANDROID_ID (si viviera en localStorage se
 *                   borraria con los datos del navegador y se perderia el acceso)
 *   - camara     -> intent nativo para las fotos de DNI
 *   - ubicacion  -> LocationHelper con timeout de 8s (igual que la app actual)
 *
 * Los metodos de @JavascriptInterface en Android son sincronicos y solo devuelven
 * primitivas, asi que lo asincronico (ubicacion, camara) va por el patron
 * pedido-con-id + callback: la web llama al nativo con un id, el nativo resuelve
 * y responde llamando a window.__staffaxisCallback(id, json).
 *
 * Si no hay shell nativo (desarrollo en el navegador de escritorio) cae en un
 * stub para poder trabajar sin compilar un APK en cada cambio.
 */

interface AndroidNativeInterface {
  getDeviceId(): string;
  getPhoneModel(): string;
  getShellVersion(): string;
  requestLocation(requestId: string): void;
  takePhoto(requestId: string): void;
}

declare global {
  interface Window {
    StaffAxisNative?: AndroidNativeInterface;
    __staffaxisCallback?: (requestId: string, payloadJson: string) => void;
  }
}

export interface Ubicacion {
  latitude: number;
  longitude: number;
}

const pendientes = new Map<string, (payload: unknown) => void>();
let contador = 0;

function nuevoId(): string {
  contador += 1;
  return `req_${Date.now()}_${contador}`;
}

// El nativo llama aca cuando termina una operacion asincronica.
window.__staffaxisCallback = (requestId, payloadJson) => {
  const resolver = pendientes.get(requestId);
  if (!resolver) return;
  pendientes.delete(requestId);
  try {
    resolver(payloadJson ? JSON.parse(payloadJson) : null);
  } catch {
    resolver(null);
  }
};

function pedirAlNativo<T>(accion: (id: string) => void, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const id = nuevoId();
    let resuelto = false;
    const terminar = (v: T | null) => {
      if (resuelto) return;
      resuelto = true;
      pendientes.delete(id);
      resolve(v);
    };
    pendientes.set(id, (payload) => terminar(payload as T | null));
    // Mismo criterio que LocationHelper: nunca bloquear la carga por esperar.
    setTimeout(() => terminar(null), timeoutMs);
    try {
      accion(id);
    } catch {
      terminar(null);
    }
  });
}

export const hayShellNativo = (): boolean => typeof window.StaffAxisNative !== 'undefined';

/**
 * device_id. En el shell nativo es el ANDROID_ID del telefono. En el navegador
 * de escritorio (solo desarrollo) se genera uno y se guarda en localStorage.
 */
export function getDeviceId(): string {
  if (window.StaffAxisNative) return window.StaffAxisNative.getDeviceId();
  const CLAVE = 'staffaxis_dev_device_id';
  let id = localStorage.getItem(CLAVE);
  if (!id) {
    id = `dev_${Math.random().toString(16).slice(2, 18)}`;
    localStorage.setItem(CLAVE, id);
  }
  return id;
}

/** Equivale a "${Build.MANUFACTURER} ${Build.MODEL}".trim() */
export function getPhoneModel(): string {
  if (window.StaffAxisNative) return window.StaffAxisNative.getPhoneModel();
  return 'navegador (desarrollo)';
}

export function getShellVersion(): string {
  if (window.StaffAxisNative) return window.StaffAxisNative.getShellVersion();
  return 'dev';
}

/** Ubicacion con timeout de 8s — nunca bloquea la tarja, igual que LocationHelper. */
/**
 * Ubicacion con cache, igual que LocationHelper.kt en la app: si hay una lectura
 * de menos de 2 minutos se usa esa y listo. Sin esto cada guardado se quedaba
 * esperando un GPS nuevo — hasta 8 segundos por empleado, con el tipo mirando
 * la pantalla.
 */
const VIGENCIA_UBICACION = 2 * 60 * 1000;
let ubicacionCache: { valor: Ubicacion | null; cuando: number } | null = null;
let pedidoEnCurso: Promise<Ubicacion | null> | null = null;

function ubicacionFresca(): Ubicacion | null | undefined {
  if (ubicacionCache && Date.now() - ubicacionCache.cuando < VIGENCIA_UBICACION) {
    return ubicacionCache.valor;
  }
  return undefined;
}

function pedirUbicacion(): Promise<Ubicacion | null> {
  if (pedidoEnCurso) return pedidoEnCurso;
  const pedido = (async (): Promise<Ubicacion | null> => {
    if (window.StaffAxisNative) {
      const nativo = window.StaffAxisNative;
      return pedirAlNativo<Ubicacion>((id) => nativo.requestLocation(id), 8000);
    }
    if (!navigator.geolocation) return null;
    return new Promise<Ubicacion | null>((resolve) => {
      let listo = false;
      const fin = (v: Ubicacion | null) => {
        if (listo) return;
        listo = true;
        resolve(v);
      };
      setTimeout(() => fin(null), 8000);
      navigator.geolocation.getCurrentPosition(
        (pos) => fin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => fin(null),
        { timeout: 8000, maximumAge: 60000 },
      );
    });
  })();
  pedidoEnCurso = pedido;
  pedido.then(
    (v) => { ubicacionCache = { valor: v, cuando: Date.now() }; pedidoEnCurso = null; },
    () => { pedidoEnCurso = null; },
  );
  return pedido;
}

/**
 * Se dispara al abrir el formulario de carga. Mientras el tipo completa las
 * horas el telefono va buscando el GPS, asi al apretar Guardar ya esta listo.
 */
export function precalentarUbicacion(): void {
  if (ubicacionFresca() !== undefined) return;
  void pedirUbicacion();
}

/**
 * La ubicacion es un dato acompanante, no el motivo de la carga: si no esta a
 * mano se guarda igual. Por eso espera poco y despues sigue de largo.
 */
export async function getUbicacion(msMaximo = 2500): Promise<Ubicacion | null> {
  const fresca = ubicacionFresca();
  if (fresca !== undefined) return fresca;
  const pedido = pedirUbicacion();
  return Promise.race([
    pedido,
    new Promise<null>((r) => setTimeout(() => r(null), msMaximo)),
  ]);
}

/**
 * Achica la foto ANTES de que entre al WebView.
 *
 * Una foto de 12MP se vuelve un data URL de ~8MB, se decodifica a ~48MB de
 * bitmap, y despues el lector de la constancia le hace dos pasadas mas de
 * canvas encima. El renderer se queda sin memoria, Android lo mata y — como el
 * proceso del WebView es el de la app — se cierra todo de golpe, sin ningun
 * error a la vista.
 *
 * La camara nunca tuvo este problema porque el shell ya la achicaba del lado
 * nativo (1600px, JPEG 80). La galeria no pasaba por ahi.
 *
 * 2400 y no 1600: las barras del PDF417 del DNI son finisimas y achicar de mas
 * las borra. La camara se banca 1600 porque el documento ocupa toda la foto,
 * pero de la galeria vienen fotos donde es una parte chica del cuadro. 2400px
 * son ~17MB de bitmap, lejos de los ~48MB de una foto de 12MP.
 *
 * Devuelve null cuando no hace falta tocarla (ya es chica) o cuando el telefono
 * no puede decodificarla; en los dos casos se sigue por el camino de siempre.
 */
const LADO_MAXIMO = 2400;

async function achicarImagen(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    // `from-image` va explicito: sin eso el bitmap puede salir SIN aplicar la
    // rotacion del EXIF, y una foto de costado no la lee ningun lector.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    if (escala >= 1) return null;
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * escala);
    c.height = Math.round(bitmap.height * escala);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    // Calidad alta: al 80% el JPEG mete ruido justo donde estan las barras
    // finas del codigo y despues no hay lector que lo saque.
    return c.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  } finally {
    // El bitmap grande se suelta si o si, aunque algo de arriba haya fallado.
    bitmap.close();
  }
}

/** El archivo tal cual, sin tocar. Solo para lo que ya viene chico. */
function leerCrudo(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Elegir una foto ya existente. Va SIEMPRE por <input type="file"> (sin
 * `capture`), que en el shell lo atiende onShowFileChooser y abre el selector
 * del sistema — galeria, archivos, Drive, lo que tenga el telefono.
 */
export async function elegirDeGaleria(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    const limpiar = () => input.remove();
    input.onchange = async () => {
      const file = input.files?.[0];
      limpiar();
      if (!file) return resolve(null);
      resolve((await achicarImagen(file)) ?? (await leerCrudo(file)));
    };
    input.oncancel = () => {
      limpiar();
      resolve(null);
    };
    input.click();
  });
}

/** Foto del DNI con la camara. Devuelve un data URL jpeg, o null si cancelo. */
export async function tomarFoto(): Promise<string | null> {
  if (window.StaffAxisNative) {
    const nativo = window.StaffAxisNative;
    const r = await pedirAlNativo<{ dataUrl?: string }>((id) => nativo.takePhoto(id), 120000);
    return r?.dataUrl ?? null;
  }
  // Desarrollo en navegador: selector de archivo con la camara como preferencia.
  // Tambien se achica, por las mismas razones que la galeria.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve((await achicarImagen(file)) ?? (await leerCrudo(file)));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
