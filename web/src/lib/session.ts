/**
 * Equivalente de data/local/preferences/AppPreferences.kt.
 *
 * Mismas claves y misma semantica que el DataStore de la app: el token de
 * dispositivo y el de supervisor son independientes (un mismo telefono podria
 * tener las dos sesiones), y cerrar sesion borra token + sector pero NO la
 * identidad del dispositivo.
 */

const K = {
  deviceToken: 'device_token',
  activeSectorId: 'active_sector_id',
  activeSectorName: 'active_sector_name',
  activeSectorTipo: 'active_sector_tipo',
  activeSectorTipos: 'active_sector_tipos',
  activeSectorEncargado: 'active_sector_encargado',
  isMaster: 'is_master_device',
  fullName: 'user_full_name',
  supervisorToken: 'supervisor_token',
  supervisorId: 'supervisor_id',
  supervisorName: 'supervisor_name',
} as const;

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* modo privado / storage bloqueado: la sesion vive solo en memoria */
  }
}

export interface SectorActivo {
  id: string;
  name: string;
  tipoCarga: string;
  encargado: string | null;
  tiposCarga: string[];
}

export const sesion = {
  getDeviceToken: (): string | null => leer(K.deviceToken),
  getSupervisorToken: (): string | null => leer(K.supervisorToken),
  getFullName: (): string | null => leer(K.fullName),
  esMaestro: (): boolean => leer(K.isMaster) === 'true',

  getSupervisor: (): { id: string; nombre: string } | null => {
    const id = leer(K.supervisorId);
    const nombre = leer(K.supervisorName);
    return id ? { id, nombre: nombre ?? '' } : null;
  },

  getSectorActivo: (): SectorActivo | null => {
    const id = leer(K.activeSectorId);
    if (!id) return null;
    let tipos: string[] = [];
    try {
      const crudo = leer(K.activeSectorTipos);
      if (crudo) tipos = JSON.parse(crudo);
    } catch {
      tipos = [];
    }
    return {
      id,
      name: leer(K.activeSectorName) ?? '',
      tipoCarga: leer(K.activeSectorTipo) ?? 'importe',
      encargado: leer(K.activeSectorEncargado),
      tiposCarga: tipos,
    };
  },

  guardarDeviceToken(token: string, isMaster = false): void {
    escribir(K.deviceToken, token);
    escribir(K.isMaster, String(isMaster));
  },

  guardarMaestro(isMaster: boolean): void {
    escribir(K.isMaster, String(isMaster));
  },

  guardarFullName(nombre: string): void {
    escribir(K.fullName, nombre);
  },

  guardarSectorActivo(s: SectorActivo): void {
    escribir(K.activeSectorId, s.id);
    escribir(K.activeSectorName, s.name);
    escribir(K.activeSectorTipo, s.tipoCarga);
    escribir(K.activeSectorEncargado, s.encargado);
    escribir(K.activeSectorTipos, JSON.stringify(s.tiposCarga ?? []));
  },

  guardarSupervisor(token: string, id: string, nombre: string): void {
    escribir(K.supervisorToken, token);
    escribir(K.supervisorId, id);
    escribir(K.supervisorName, nombre);
  },

  /**
   * Corta la sesion de dispositivo (token + sector). La usa la revocacion en
   * caliente. No toca la sesion de supervisor ni la identidad del dispositivo.
   */
  cerrarSesionDispositivo(): void {
    escribir(K.deviceToken, null);
    escribir(K.activeSectorId, null);
    escribir(K.activeSectorName, null);
    escribir(K.activeSectorTipo, null);
    escribir(K.activeSectorTipos, null);
    escribir(K.activeSectorEncargado, null);
    escribir(K.isMaster, null);
  },

  cerrarSesionSupervisor(): void {
    escribir(K.supervisorToken, null);
    escribir(K.supervisorId, null);
    escribir(K.supervisorName, null);
  },
};
