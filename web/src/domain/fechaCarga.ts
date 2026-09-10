/**
 * Port exacto de domain/model/RestriccionFechaCarga.kt.
 *
 * Solo se puede tarjar (cargar horas nuevas) para hoy o ayer. No afecta editar
 * los valores de un registro YA cargado — esa pantalla no tiene selector de fecha.
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

export function esFechaCargable(fechaISO: string, hoy: string = hoyISO()): boolean {
  const ayer = sumarDias(hoy, -1);
  return fechaISO <= hoy && fechaISO >= ayer;
}
