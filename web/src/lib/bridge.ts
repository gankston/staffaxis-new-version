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
export async function getUbicacion(): Promise<Ubicacion | null> {
  if (window.StaffAxisNative) {
    const nativo = window.StaffAxisNative;
    return pedirAlNativo<Ubicacion>((id) => nativo.requestLocation(id), 8000);
  }
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
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
}

/** Foto del DNI. Devuelve un data URL jpeg, o null si el usuario cancelo. */
export async function tomarFoto(): Promise<string | null> {
  if (window.StaffAxisNative) {
    const nativo = window.StaffAxisNative;
    const r = await pedirAlNativo<{ dataUrl?: string }>((id) => nativo.takePhoto(id), 120000);
    return r?.dataUrl ?? null;
  }
  // Desarrollo en navegador: selector de archivo con la camara como preferencia.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
