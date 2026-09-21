/**
 * Migas de pan para cuando la app se cierra sola.
 *
 * Si Android mata el proceso no hay forma de que la app avise nada: no corre
 * mas codigo, no hay log, no queda ni un error. Lo unico que sobrevive es lo
 * que ya se escribio en el almacenamiento del navegador.
 *
 * Asi que cada paso riesgoso deja una marca ANTES de empezar y la borra al
 * terminar bien. Si la app vuelve a arrancar y encuentra una marca sin borrar,
 * es exactamente el paso donde murio.
 */
const CLAVE = 'staffaxis_rastro';

export interface Rastro {
  paso: string;
  detalle?: string;
  cuando: number;
}

export function marcarPaso(paso: string, detalle?: string): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ paso, detalle, cuando: Date.now() }));
  } catch {
    /* sin storage no hay rastro, y la app tiene que andar igual */
  }
}

export function pasoTerminado(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* idem */
  }
}

/**
 * El paso que quedo sin cerrar de la vez anterior, si lo hay. Se consume: se
 * lee una sola vez y se borra, para no repetir el aviso para siempre.
 */
export function rastroCaido(): Rastro | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    localStorage.removeItem(CLAVE);
    const r = JSON.parse(crudo) as Rastro;
    // Mas de un dia atras ya no dice nada util.
    if (!r?.paso || Date.now() - r.cuando > 86_400_000) return null;
    return r;
  } catch {
    return null;
  }
}

/** Corre algo dejando la marca puesta mientras dura. */
export async function conRastro<T>(paso: string, detalle: string | undefined, fn: () => Promise<T>): Promise<T> {
  marcarPaso(paso, detalle);
  try {
    return await fn();
  } finally {
    pasoTerminado();
  }
}
