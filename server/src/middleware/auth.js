import jwt from 'jsonwebtoken';
import { db } from '../db.js';

export async function verifyDevice(request, reply) {
  const auth = request.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'No autorizado' });
  }
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return reply.status(401).send({ error: 'Token inválido o expirado' });
  }

  // Chequeo de revocacion en caliente: si el dispositivo fue revocado despues
  // de emitido el token, el JWT sigue siendo "valido" (no vence hasta el año),
  // asi que hay que consultar la base en cada pedido para cortarlo de verdad.
  // Devices viejos (columna no existia antes de esta feature) tienen revoked=false
  // por default, asi que esto no rompe nada de lo que ya funcionaba.
  try {
    const r = await db.query('SELECT revoked FROM devices WHERE device_id = $1', [payload.deviceId]);
    if (r.rows[0]?.revoked) {
      return reply.status(403).send({ error: 'Dispositivo revocado', revoked: true });
    }
  } catch (err) {
    // Si la consulta a la DB falla, no bloqueamos al usuario por un problema nuestro.
    request.log?.error?.('verifyDevice: fallo chequeo de revocacion: ' + err.message);
  }

  request.device = payload;
}

export async function verifyAdmin(request, reply) {
  const token = request.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return reply.status(401).send({ error: 'Acceso de administrador requerido' });
  }
}
