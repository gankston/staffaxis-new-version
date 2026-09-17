/**
 * Cliente HTTP — equivalente de di/NetworkModule.kt + los ApiService de Retrofit.
 *
 * Replica el comportamiento de los interceptores de la app:
 *  - Authorization: Bearer <token> + X-Device-Token (mismo valor).
 *  - /api/supervisor/* usa el token de supervisor; el resto, el de dispositivo.
 *  - Cache-Control no-cache en cada pedido.
 *  - Un 403 con {"revoked":true} en CUALQUIER endpoint dispara el logout global.
 *  - callTimeout de 30s.
 */
import { sesion } from './session';
import type { TiposCargaNuevos } from '../domain/tiposCarga';

// Mismo origen que la API: la web se sirve desde el propio backend.
const BASE = '';
const TIMEOUT_MS = 30_000;

type OyenteRevocacion = () => void;
const oyentesRevocacion = new Set<OyenteRevocacion>();

export function alRevocarse(fn: OyenteRevocacion): () => void {
  oyentesRevocacion.add(fn);
  return () => oyentesRevocacion.delete(fn);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class SinConexionError extends Error {
  constructor() {
    super('Sin conexión');
    this.name = 'SinConexionError';
  }
}

interface OpcionesPedido {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  formData?: FormData;
  esperaBlob?: boolean;
}

async function pedir<T>(ruta: string, opts: OpcionesPedido = {}): Promise<T> {
  const esSupervisor = ruta.startsWith('/api/supervisor');
  const token = esSupervisor ? sesion.getSupervisorToken() : sesion.getDeviceToken();

  let url = BASE + ruta;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== null && v !== undefined) qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Device-Token'] = token;
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new SinConexionError();
  }
  clearTimeout(timer);

  if (resp.status === 403) {
    const texto = await resp.clone().text().catch(() => '');
    if (texto.includes('"revoked":true') || texto.includes('"revoked": true')) {
      for (const fn of oyentesRevocacion) fn();
    }
  }

  if (!resp.ok) {
    let mensaje = `Error ${resp.status}`;
    let code: string | undefined;
    try {
      const j = await resp.json();
      if (j?.error) mensaje = j.error;
      if (j?.code) code = j.code;
    } catch {
      /* respuesta sin json */
    }
    throw new ApiError(resp.status, mensaje, code);
  }

  if (opts.esperaBlob) return (await resp.blob()) as unknown as T;
  if (resp.status === 204) return undefined as unknown as T;
  const texto = await resp.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

// ─── Tipos de respuesta (espejo de los DTO) ──────────────────────────────────

export interface SectorDto {
  id: string;
  name: string;
  encargado?: string | null;
  tipoCarga?: string | null;
  tiposCarga?: string[] | null;
}

export interface EmployeeDto {
  id: string;
  sector_id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  is_active: boolean;
  tiene_foto_frente: boolean;
  tiene_foto_dorso: boolean;
}

/** Una ficha encontrada por DNI, con el sector donde esta hoy. */
export interface EmpleadoEncontradoDto extends EmployeeDto {
  sector_name: string | null;
  es_de_mi_sector: boolean;
}

export interface AccessStatusDto {
  status: 'pending' | 'authorized' | 'rejected';
  token?: string | null;
  is_master?: boolean | null;
  request_id?: string | null;
}

export interface RechazadaDto {
  id: string;
  empleado: string;
  date: string;
  minutesWorked: string | null;
  motivo: string | null;
  rechazadaPor: string | null;
}

export interface AbsenceDto {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  is_justified: number;
  observations: string | null;
}

export interface AdminReportRowDto {
  submission_id: string;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  dni: string | null;
  date: string;
  minutes_worked: string | null;
  notes: string | null;
  status: string | null;
  horas: number | null;
  cosecha: number | null;
  cajas: number | null;
  cajones: number | null;
  abonada: number | null;
  km_viajes: number | null;
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
  cosecha_canadas?: number | null;
  cosecha_inv?: number | null;
  tantero_invernadero?: number | null;
  tantero_campo?: number | null;
  descarga_jaula?: number | null;
  descarga_camion?: number | null;
  carga_jaula?: number | null;
  carga_camion_cantidad?: number | null;
}

export interface SupervisorPendingItemDto {
  id: string;
  employeeId: string;
  empleado: string;
  sectorId?: string | null;
  sector: string;
  tiposCarga?: string[] | null;
  date: string;
  minutesWorked: string | null;
  notes: string | null;
  fueModificada: boolean;
  kmViajes?: number | null;
  cosechaCanadas?: number | null;
  cosechaInv?: number | null;
  tanteroInvernadero?: number | null;
  tanteroCampo?: number | null;
  hasFumigadas?: number | null;
  siembraTrilla?: number | null;
  bolseros?: number | null;
  etiquetado?: number | null;
  cargaCamionKg50?: boolean | null;
  cargaCamionKg25?: boolean | null;
  cargaCamionOtro?: string | null;
  movimientoEstibaKg50?: boolean | null;
  movimientoEstibaKg25?: boolean | null;
  movimientoEstibaOtro?: string | null;
  etiquetadoLata185?: number | null;
  etiquetadoLata750?: number | null;
  etiquetadoLata2500?: number | null;
  etiquetadoLata8kg?: number | null;
  descargaJaula?: number | null;
  descargaCamion?: number | null;
  cargaJaula?: number | null;
  cargaCamionCantidad?: number | null;
}

export interface SupervisorResumenRowDto {
  submission_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  sector_name: string;
  date: string;
  minutes_worked: string | null;
  status: string;
  km_viajes?: number | null;
  has_fumigadas?: number | null;
  siembra_trilla?: number | null;
  bolseros?: number | null;
  etiquetado?: number | null;
  carga_camion_kg50?: boolean | null;
  carga_camion_kg25?: boolean | null;
  carga_camion_otro?: string | null;
  movimiento_estiba_kg50?: boolean | null;
  movimiento_estiba_kg25?: boolean | null;
  movimiento_estiba_otro?: string | null;
  etiquetado_lata_185?: number | null;
  etiquetado_lata_750?: number | null;
  etiquetado_lata_2500?: number | null;
  etiquetado_lata_8kg?: number | null;
  cosecha_canadas?: number | null;
  cosecha_inv?: number | null;
  tantero_invernadero?: number | null;
  tantero_campo?: number | null;
  descarga_jaula?: number | null;
  descarga_camion?: number | null;
  carga_jaula?: number | null;
  carga_camion_cantidad?: number | null;
}

export interface CrearSubmissionBody {
  employee_id: string;
  date: string;
  minutes_worked?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  horas?: number | null;
  cosecha?: number | null;
  cajas?: number | null;
  cajones?: number | null;
  abonada?: number | null;
  km_viajes?: number | null;
  has_fumigadas?: number | null;
  siembra_trilla?: number | null;
  bolseros?: number | null;
  etiquetado?: number | null;
  carga_camion_kg50?: boolean | null;
  carga_camion_kg25?: boolean | null;
  carga_camion_otro?: string | null;
  movimiento_estiba_kg50?: boolean | null;
  movimiento_estiba_kg25?: boolean | null;
  movimiento_estiba_otro?: string | null;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  // Auth / dispositivo
  getSectores: () => pedir<{ sectors: SectorDto[] }>('/api/sectors'),

  getSectoresPermitidos: () =>
    pedir<{ ok: boolean; allowedSectors: SectorDto[] }>('/api/auth/device/allowed-sectors'),

  pedirAcceso: (body: {
    device_id: string;
    sector_id: string;
    full_name: string;
    phone_model: string | null;
    latitude: number | null;
    longitude: number | null;
  }) => pedir<AccessStatusDto>('/api/auth/request-access', { method: 'POST', body }),

  /** Sesion que el telefono ya tenia en el servidor, para no volver a pedir el sector. */
  sesionExistente: (deviceId: string) =>
    pedir<{
      hay_sesion: boolean;
      token?: string;
      is_master?: boolean;
      encargado_name?: string | null;
      sector?: { id: string; name: string; tipoCarga: string; tiposCarga: string[]; encargado: string | null };
    }>('/api/auth/sesion-existente', { method: 'POST', body: { device_id: deviceId } }),

  estadoAcceso: (requestId: string) =>
    pedir<AccessStatusDto>(`/api/auth/request-access/${encodeURIComponent(requestId)}`),

  estadoDispositivo: () => pedir<{ ok: boolean; is_master: boolean | null }>('/api/auth/device/status'),

  // Empleados
  getEmpleados: (sectorId: string) =>
    pedir<{ employees: EmployeeDto[] }>('/api/employees', { query: { sector_id: sectorId } }),

  crearEmpleado: (body: {
    first_name: string;
    last_name: string;
    dni: string | null;
    sector_id: string;
    force_transfer?: boolean;
  }) => pedir<EmployeeDto>('/api/employees', { method: 'POST', body }),

  /** Busca en TODOS los sectores, no solo en el propio. */
  buscarPorDni: (dni: string) =>
    pedir<{ rows: EmpleadoEncontradoDto[] }>(`/api/employees/buscar?dni=${encodeURIComponent(dni)}`),

  /** Trae esa ficha al sector del equipo (y la reactiva si estaba de baja). */
  moverEmpleado: (id: string) =>
    pedir<EmployeeDto>(`/api/employees/${encodeURIComponent(id)}/mover`, { method: 'POST', body: {} }),

  actualizarEmpleado: (
    id: string,
    body: { first_name?: string; last_name?: string | null; dni?: string | null; is_active?: boolean },
  ) => pedir<EmployeeDto>(`/api/employees/${encodeURIComponent(id)}`, { method: 'PUT', body }),

  subirFoto: (id: string, lado: 'frente' | 'dorso', archivo: Blob) => {
    const fd = new FormData();
    fd.append('file', archivo, `${id}_${lado}.jpg`);
    return pedir<{ ok: boolean; lado: string }>(
      `/api/employees/${encodeURIComponent(id)}/foto/${lado}`,
      { method: 'POST', formData: fd },
    );
  },

  borrarFoto: (id: string, lado: 'frente' | 'dorso') =>
    pedir<{ ok: boolean }>(`/api/employees/${encodeURIComponent(id)}/foto/${lado}`, { method: 'DELETE' }),

  urlFoto: (id: string, lado: 'frente' | 'dorso') =>
    `${BASE}/api/employees/${encodeURIComponent(id)}/foto/${lado}`,

  getFoto: (id: string, lado: 'frente' | 'dorso') =>
    pedir<Blob>(`/api/employees/${encodeURIComponent(id)}/foto/${lado}`, { esperaBlob: true }),

  // Tarjas
  crearSubmission: (body: CrearSubmissionBody) =>
    pedir<{ id: string; status: string }>('/api/submissions', { method: 'POST', body }),

  getRechazadas: () => pedir<{ items: RechazadaDto[] }>('/api/rechazadas'),

  // Tarjas ya cargadas del sector de este dispositivo. Reemplaza las lecturas
  // que la app Android hace contra su base local (Room + outbox).
  getSubmissions: (desde?: string, hasta?: string, empleadoId?: string) =>
    pedir<{ rows: AdminReportRowDto[] }>('/api/submissions', {
      query: { start_date: desde, end_date: hasta, employee_id: empleadoId },
    }),

  // Ausencias
  crearAusencia: (body: {
    employee_id: string;
    start_date: string;
    end_date: string;
    is_justified: boolean;
    observations: string | null;
  }) => pedir<AbsenceDto>('/api/absences', { method: 'POST', body }),

  getAusencias: (startDate?: string, endDate?: string) =>
    pedir<{ absences: AbsenceDto[] }>('/api/absences', {
      query: { start_date: startDate, end_date: endDate },
    }),

  // Reporte (lo usa el visualizador de la pantalla de Tarja)
  getReporte: (adminToken: string, sectorId: string, startDate: string, endDate: string) =>
    pedir<{ rows: AdminReportRowDto[] }>('/api/admin/report', {
      query: { sector_id: sectorId, start_date: startDate, end_date: endDate },
    }).catch((e) => {
      void adminToken;
      throw e;
    }),

  // Supervisor
  listarSupervisores: () =>
    pedir<{ supervisors: Array<{ id: string; full_name: string }> }>('/api/auth/supervisors'),

  pedirAccesoSupervisor: (body: {
    device_id: string;
    supervisor_id: string;
    phone_model: string | null;
    latitude: number | null;
    longitude: number | null;
  }) => pedir<AccessStatusDto>('/api/auth/request-access-supervisor', { method: 'POST', body }),

  estadoAccesoSupervisor: (requestId: string) =>
    pedir<AccessStatusDto>(`/api/auth/request-access-supervisor/${encodeURIComponent(requestId)}`),

  supervisorMe: () =>
    pedir<{ id: string; full_name: string; sectores: Array<{ id: string; name: string }> }>(
      '/api/supervisor/me',
    ),

  supervisorPendientes: () =>
    pedir<{ items: SupervisorPendingItemDto[] }>('/api/supervisor/pending'),

  supervisorAprobar: (submissionIds: string[]) =>
    pedir<{ ok: boolean; aprobadas: number | null }>('/api/supervisor/approve', {
      method: 'POST',
      body: { submission_ids: submissionIds },
    }),

  supervisorRechazar: (submissionIds: string[], motivo: string | null) =>
    pedir<{ ok: boolean; rechazadas: number | null }>('/api/supervisor/reject', {
      method: 'POST',
      body: { submission_ids: submissionIds, motivo },
    }),

  supervisorResumen: (fechaDesde: string, fechaHasta: string) =>
    pedir<{ rows: SupervisorResumenRowDto[] }>('/api/supervisor/resumen', {
      query: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta },
    }),
};

export type { TiposCargaNuevos };
