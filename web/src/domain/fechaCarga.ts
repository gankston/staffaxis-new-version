/**
 * Port exacto de domain/model/RestriccionFechaCarga.kt.
 *
 * Solo se puede tarjar (cargar horas nuevas) para hoy o los dias que permita el
 * sector. No afecta editar los valores de un registro YA cargado — esa pantalla
 * no tiene selector de fecha.
 */

/** Fecha local del dispositivo en formato yyyy-MM-dd (equivale a LocalDate.now()). */
export function hoyISO(): string {
  return aISO(new Date());
}

export function aISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function desdeISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(iso: string, dias: number): string {
  const d = desdeISO(iso);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/**
 * Cuantos dias para atras puede cargar cada sector. Por defecto uno (hoy o ayer);
 * OTITO carga tres porque el encargado no baja todos los dias y junta las tarjas.
 */
const DIAS_ATRAS_POR_SECTOR: Record<string, number> = {
  '612deb14-b814-49dc-95d1-d413a61abdf6': 3, // OTITO
};
const DIAS_ATRAS_POR_DEFECTO = 1;

export function diasAtras(sectorId?: string | null): number {
  return (sectorId ? DIAS_ATRAS_POR_SECTOR[sectorId] : undefined) ?? DIAS_ATRAS_POR_DEFECTO;
}

export function esFechaCargable(fechaISO: string, hoy: string = hoyISO(), sectorId?: string | null): boolean {
  const masViejo = sumarDias(hoy, -diasAtras(sectorId));
  return fechaISO <= hoy && fechaISO >= masViejo;
}

/** Las fechas que se pueden elegir, de la mas vieja a hoy. */
export function fechasCargables(hoy: string = hoyISO(), sectorId?: string | null): string[] {
  const n = diasAtras(sectorId);
  return Array.from({ length: n + 1 }, (_, i) => sumarDias(hoy, i - n));
}
