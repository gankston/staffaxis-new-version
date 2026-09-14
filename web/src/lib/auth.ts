/**
 * Equivalente de data/repository/AuthRepositoryImpl.kt.
 *
 * Ojo con getSectoresPermitidos: la app NO usa /api/auth/device/allowed-sectors.
 * Trae /api/sectors y filtra del lado del cliente por el encargado del sector
 * activo (o devuelve todos si el dispositivo es maestro). Se replica igual para
 * que la lista de sectores salga identica.
 */
import { api, type SectorDto } from './api';
import { sesion } from './session';
import { getDeviceId, getPhoneModel, getUbicacion } from './bridge';

export interface Sector {
  id: string;
  name: string;
  tipoCarga: string;
  encargado: string | null;
  tiposCarga: string[];
}

function aSector(d: SectorDto): Sector {
  return {
    id: d.id,
    name: d.name,
    tipoCarga: d.tipoCarga ?? 'importe',
    encargado: d.encargado ?? null,
    tiposCarga: d.tiposCarga ?? [],
  };
}

const porNombre = (a: Sector, b: Sector) => a.name.localeCompare(b.name);

export async function fetchSectoresPublicos(): Promise<Sector[]> {
  const r = await api.getSectores();
  return (r.sectors ?? []).map(aSector);
}

export async function getSectoresPermitidos(): Promise<Sector[]> {
  const sectorActual = sesion.getSectorActivo();
  if (!sectorActual) throw new Error('Sin sector');

  const r = await api.getSectores();
  const todos = (r.sectors ?? []).map(aSector);

  // Dispositivo maestro: ve todos, sin la restriccion de encargado.
  if (sesion.esMaestro()) return [...todos].sort(porNombre);

  const actual = todos.find((s) => s.id === sectorActual.id);
  const encargado = actual?.encargado?.trim();

  if (encargado) {
    return todos
      .filter((s) => (s.encargado ?? '').trim().toLowerCase() === encargado.toLowerCase())
      .sort(porNombre);
  }
  return actual ? [actual] : [];
}

export type ResultadoAcceso =
  | { tipo: 'authorized'; token: string; esMaestro: boolean }
  | { tipo: 'pending'; requestId: string };

export async function solicitarAcceso(sector: Sector, nombreCompleto: string): Promise<ResultadoAcceso> {
  const ubicacion = await getUbicacion(8000);
  const body = await api.pedirAcceso({
    device_id: getDeviceId(),
    sector_id: sector.id,
    full_name: nombreCompleto,
    phone_model: getPhoneModel(),
    latitude: ubicacion?.latitude ?? null,
    longitude: ubicacion?.longitude ?? null,
  });

  sesion.guardarFullName(nombreCompleto);

  if (body.status === 'authorized') {
    if (!body.token) throw new Error('Respuesta inválida del servidor');
    const esMaestro = body.is_master === true;
    sesion.guardarDeviceToken(body.token, esMaestro);
    return { tipo: 'authorized', token: body.token, esMaestro };
  }
  if (body.status === 'pending') {
    if (!body.request_id) throw new Error('Respuesta inválida del servidor');
    return { tipo: 'pending', requestId: body.request_id };
  }
  throw new Error('Respuesta inesperada del servidor');
}

export type EstadoAcceso =
  | { tipo: 'pending' }
  | { tipo: 'rejected' }
  | { tipo: 'authorized'; token: string; esMaestro: boolean };

export async function consultarEstadoAcceso(requestId: string): Promise<EstadoAcceso> {
  const body = await api.estadoAcceso(requestId);
  if (body.status === 'pending') return { tipo: 'pending' };
  if (body.status === 'rejected') return { tipo: 'rejected' };
  if (body.status === 'authorized') {
    if (!body.token) throw new Error('Respuesta inválida del servidor');
    const esMaestro = body.is_master === true;
    sesion.guardarDeviceToken(body.token, esMaestro);
    return { tipo: 'authorized', token: body.token, esMaestro };
  }
  throw new Error('Respuesta inesperada del servidor');
}

export function guardarSectorActivo(s: Sector): void {
  sesion.guardarSectorActivo({
    id: s.id,
    name: s.name,
    tipoCarga: s.tipoCarga,
    encargado: s.encargado,
    tiposCarga: s.tiposCarga,
  });
}
