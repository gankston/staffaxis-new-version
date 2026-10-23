import { db } from '../db.js';
import { normalizarDni } from './dniUtils.js';

// Lista negra de RRHH (pedido de Gastón, 23/10/2026): personas que no se pueden
// dar de alta desde la app de los encargados. El motivo no se guarda ni se
// muestra; el encargado solo ve este cartel. StaffAdmin no la aplica, asi RRHH
// puede decidir.
export const MENSAJE_LISTA_NEGRA = 'Este empleado no puede darse de alta, comuníquese con Recursos Humanos.';

export async function enListaNegra(dni) {
  const d = normalizarDni(dni);
  if (!d) return false;
  const r = await db.query('SELECT 1 FROM lista_negra WHERE dni = $1', [d]);
  return r.rowCount > 0;
}

export function rechazoListaNegra(reply) {
  return reply.status(403).send({ error: MENSAJE_LISTA_NEGRA, code: 'LISTA_NEGRA' });
}
