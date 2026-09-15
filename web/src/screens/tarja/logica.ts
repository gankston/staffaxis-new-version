/** Lógica de TarjaViewModel: período 21→20, formatos y el cierre local del día. */

export interface Periodo {
  desde: string;
  hasta: string;
  label: string;
}

const dd = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${dd(m + 1)}-${dd(d)}`;
const legible = (s: string) => s.split('-').reverse().join('/');

/**
 * calcularPeriodo(): del 21 de un mes al 20 del siguiente. Si hoy es 21 o más,
 * el período arranca este mes; si no, arrancó el mes pasado. El offset corre
 * el período completo hacia atrás.
 */
export function calcularPeriodo(hoyISO: string, offset = 0): Periodo {
  const [y, m, d] = hoyISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);

  let inicio: Date;
  let fin: Date;
  if (base.getDate() >= 21) {
    inicio = new Date(base.getFullYear(), base.getMonth(), 21);
    fin = new Date(base.getFullYear(), base.getMonth() + 1, 20);
  } else {
    inicio = new Date(base.getFullYear(), base.getMonth() - 1, 21);
    fin = new Date(base.getFullYear(), base.getMonth(), 20);
  }
  inicio.setMonth(inicio.getMonth() + offset);
  fin.setMonth(fin.getMonth() + offset);

  const desde = iso(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const hasta = iso(fin.getFullYear(), fin.getMonth(), fin.getDate());
  return { desde, hasta, label: `${legible(desde)} – ${legible(hasta)}` };
}

/** Todos los días del período, en orden. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(desde + 'T00:00:00');
  const fin = new Date(hasta + 'T00:00:00');
  while (d <= fin) {
    out.push(iso(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const fmtHoras = (h: number) => (h % 1 === 0 ? `${Math.trunc(h)}H` : `${h.toFixed(1)}H`);
export const fmtCantidad = (v: number) => (v % 1 === 0 ? String(Math.trunc(v)) : v.toFixed(2));
/**
 * ABONADA NO ES PLATA. En la base conviven cantidades con descripciones
 * ("barcadilla", "14 bolsas"), asi que va sin simbolo de moneda ni separador
 * de miles: es el valor tal cual se cargo.
 */
export const fmtAbonada = (v: number) => (v % 1 === 0 ? String(Math.trunc(v)) : String(v));

/**
 * El cierre de tarja de la app vive en Room (tabla tarja_status), no en el
 * servidor: es una marca del dispositivo. Acá cumple el mismo rol en el
 * almacenamiento local del navegador.
 */
/** Un jornal son 8 horas, igual que HORAS_POR_JORNAL de la app. */
export const HORAS_POR_JORNAL = 8;

export interface Cierre {
  enviada: boolean;
  horaEnvio: number;
  empleadosTarjados: number;
  horasTarjadas: number;
  abonada: number;
}

const clave = (sectorId: string, fecha: string) => `tarja_cierre_${sectorId}_${fecha}`;

export const cierreLocal = {
  leer(sectorId: string, fecha: string): Cierre | null {
    try {
      const crudo = localStorage.getItem(clave(sectorId, fecha));
      return crudo ? (JSON.parse(crudo) as Cierre) : null;
    } catch {
      return null;
    }
  },
  guardar(sectorId: string, fecha: string, c: Cierre): void {
    try {
      localStorage.setItem(clave(sectorId, fecha), JSON.stringify(c));
    } catch {
      /* storage bloqueado: el cierre vale solo para esta sesión */
    }
  },
};
