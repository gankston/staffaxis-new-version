/**
 * Equivalente de EmployeeRepositoryImpl.kt + SubmissionRepositoryImpl (parte de
 * lectura). La app Android cachea en Room; aca la lista viva del sector cumple
 * el mismo rol, incluidos los inactivos (el endpoint los devuelve igual, y de
 * ahi sale el caso EXISTS_INACTIVE).
 */
import { ApiError, api, type EmployeeDto } from './api';
import type { TiposCargaNuevos } from '../domain/tiposCarga';

export interface Empleado {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  sectorId: string;
  sectorName: string;
  activo: boolean;
  observacion: string | null;
  tieneFotoFrente: boolean;
  tieneFotoDorso: boolean;
}

export function aEmpleado(d: EmployeeDto, sectorName: string): Empleado {
  return {
    id: d.id,
    // Igual que el repo Kotlin: nombre = "first last", apellido = "last".
    nombre: `${d.first_name} ${d.last_name}`.trim(),
    apellido: (d.last_name ?? '').trim(),
    dni: d.dni,
    sectorId: d.sector_id,
    sectorName,
    activo: d.is_active,
    observacion: null,
    tieneFotoFrente: d.tiene_foto_frente,
    tieneFotoDorso: d.tiene_foto_dorso,
  };
}

export async function listarEmpleados(sectorId: string, sectorName: string): Promise<Empleado[]> {
  const r = await api.getEmpleados(sectorId);
  return (r.employees ?? [])
    .map((d) => aEmpleado(d, sectorName))
    .filter((e) => e.activo)
    .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
}

/** Incluye inactivos — se usa para el pre-chequeo de alta (EXISTS_INACTIVE). */
export async function listarEmpleadosCrudos(sectorId: string, sectorName: string): Promise<Empleado[]> {
  const r = await api.getEmpleados(sectorId);
  return (r.employees ?? []).map((d) => aEmpleado(d, sectorName));
}

export type ResultadoAlta =
  | { tipo: 'ok'; empleado: Empleado }
  | { tipo: 'existe_mismo_sector' }
  | { tipo: 'existe_otro_sector' }
  | { tipo: 'existe_inactivo'; id: string; nombre: string }
  | { tipo: 'error'; mensaje: string };

/**
 * createEmployee() del repo: primero el chequeo contra la lista del sector
 * (igual que el `dao.getByDniAndSector` de Room), despues el servidor.
 */
export async function crearEmpleado(
  nombre: string,
  apellido: string,
  dni: string,
  sectorId: string,
  sectorName: string,
  enElSector: Empleado[],
  forceTransfer: boolean,
): Promise<ResultadoAlta> {
  if (!forceTransfer && dni.trim()) {
    const existente = enElSector.find((e) => e.dni === dni && e.sectorId === sectorId);
    if (existente) {
      return existente.activo
        ? { tipo: 'existe_mismo_sector' }
        : { tipo: 'existe_inactivo', id: existente.id, nombre: existente.nombre };
    }
  }

  try {
    const dto = await api.crearEmpleado({
      first_name: nombre.trim(),
      last_name: apellido.trim() || '.',
      dni: dni.trim() || null,
      sector_id: sectorId,
      force_transfer: forceTransfer,
    });
    return { tipo: 'ok', empleado: aEmpleado(dto, sectorName) };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 409 || e.status === 422)) {
      return { tipo: 'existe_otro_sector' };
    }
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error' };
  }
}

export type ResultadoEdicion =
  | { tipo: 'ok' }
  | { tipo: 'existe_mismo_sector' }
  | { tipo: 'existe_otro_sector' }
  | { tipo: 'error'; mensaje: string };

export async function actualizarEmpleado(
  id: string,
  nombre: string,
  apellido: string,
  dni: string | null,
): Promise<ResultadoEdicion> {
  try {
    await api.actualizarEmpleado(id, {
      first_name: nombre.trim(),
      last_name: apellido.trim() || null,
      dni: dni?.trim() || null,
    });
    return { tipo: 'ok' };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) return { tipo: 'existe_mismo_sector' };
      if (e.status === 422) return { tipo: 'existe_otro_sector' };
      return { tipo: 'error', mensaje: e.message };
    }
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error' };
  }
}

export const ocultarEmpleado = (id: string) => api.actualizarEmpleado(id, { is_active: false });
export const reactivarEmpleado = (id: string) => api.actualizarEmpleado(id, { is_active: true });

/** Una tarja ya guardada, tal como la devuelve GET /api/submissions. */
export interface Registro {
  id: string;
  employeeId: string;
  date: string;
  minutesWorked: string | null;
  notes: string | null;
  status: string;
  tiposNuevos: TiposCargaNuevos;
  firstName: string | null;
  lastName: string | null;
}

interface FilaSubmission {
  submission_id: string;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  date: string;
  minutes_worked: string | null;
  notes: string | null;
  status: string | null;
  km_viajes: number | null;
  cosecha_canadas?: number | null;
  cosecha_inv?: number | null;
  tantero_invernadero?: number | null;
  tantero_campo?: number | null;
  has_fumigadas: number | null;
  siembra_trilla: number | null;
  bolseros: number | null;
  etiquetado: number | null;
  carga_camion_kg50: boolean | null;
  carga_camion_kg25: boolean | null;
  carga_camion_otro: string | null;
  movimiento_estiba_kg50: boolean | null;
  movimiento_estiba_kg25: boolean | null;
  movimiento_estiba_otro: string | null;
  etiquetado_lata_185?: number | null;
  etiquetado_lata_750?: number | null;
  etiquetado_lata_2500?: number | null;
  etiquetado_lata_8kg?: number | null;
  descarga_jaula?: number | null;
  descarga_camion?: number | null;
  carga_jaula?: number | null;
  carga_camion_cantidad?: number | null;
}

function aRegistro(f: FilaSubmission): Registro {
  return {
    id: f.submission_id,
    employeeId: f.employee_id,
    date: String(f.date).slice(0, 10),
    minutesWorked: f.minutes_worked,
    notes: f.notes,
    status: f.status ?? "approved",
    firstName: f.first_name,
    lastName: f.last_name,
    tiposNuevos: {
      kmViajes: f.km_viajes,
      hasFumigadas: f.has_fumigadas,
      siembraTrilla: f.siembra_trilla,
      bolseros: f.bolseros,
      etiquetado: f.etiquetado,
      cargaCamionKg50: f.carga_camion_kg50,
      cargaCamionKg25: f.carga_camion_kg25,
      cargaCamionOtro: f.carga_camion_otro,
      movimientoEstibaKg50: f.movimiento_estiba_kg50,
      movimientoEstibaKg25: f.movimiento_estiba_kg25,
      movimientoEstibaOtro: f.movimiento_estiba_otro,
      etiquetadoLata185: f.etiquetado_lata_185 ?? null,
      etiquetadoLata750: f.etiquetado_lata_750 ?? null,
      etiquetadoLata2500: f.etiquetado_lata_2500 ?? null,
      etiquetadoLata8kg: f.etiquetado_lata_8kg ?? null,
      descargaJaula: f.descarga_jaula ?? null,
      descargaCamion: f.descarga_camion ?? null,
      cargaJaula: f.carga_jaula ?? null,
      cargaCamionCantidad: f.carga_camion_cantidad ?? null,
      cosechaCanadas: f.cosecha_canadas ?? null,
      cosechaInv: f.cosecha_inv ?? null,
      tanteroInvernadero: f.tantero_invernadero ?? null,
      tanteroCampo: f.tantero_campo ?? null,
    },
  };
}

export async function listarRegistros(opts: {
  desde?: string;
  hasta?: string;
  empleadoId?: string;
}): Promise<Registro[]> {
  const r = await api.getSubmissions(opts.desde, opts.hasta, opts.empleadoId);
  return (r.rows ?? []).map(aRegistro);
}
