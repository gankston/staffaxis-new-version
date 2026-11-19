import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { verifyAdmin } from '../middleware/auth.js';
import { mandarPush, pushConfigurado } from '../lib/push.js';

/**
 * El telefono avisa a donde le llegan las notificaciones (token de Firebase).
 * Sirve el token del encargado y tambien el del supervisor: los dos traen
 * deviceId. El token de Firebase cambia solo de vez en cuando (reinstalar,
 * borrar datos), por eso la web lo vuelve a mandar cada tanto.
 */
function datosDelToken(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return p?.deviceId ? p : null;
  } catch {
    return null;
  }
}

export async function pushRoutes(app) {

  // POST /api/push/token   body: { token, modelo }
  // /api/supervisor/push-token es lo mismo para el telefono que solo tiene sesion
  // de supervisor (la web manda el token de supervisor a las rutas /api/supervisor).
  const registrar = async (req, reply) => {
    const quien = datosDelToken(req);
    if (!quien) return reply.status(401).send({ error: 'No autorizado' });
    const token = String(req.body?.token ?? '').trim();
    if (token.length < 20 || token.length > 4096) return reply.status(400).send({ error: 'token inválido' });

    // El sector sale de la base y no del JWT: el JWT queda con el sector con el
    // que se autorizo el telefono, y el encargado puede haberse cambiado despues.
    const dev = await db.query('SELECT sector_id FROM devices WHERE device_id = $1', [quien.deviceId]);
    const sectorId = dev.rows[0]?.sector_id ?? quien.sectorId ?? null;

    await db.query(
      `INSERT INTO push_tokens (token, device_id, sector_id, supervisor_id, modelo, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (token) DO UPDATE
         SET device_id = EXCLUDED.device_id,
             sector_id = EXCLUDED.sector_id,
             supervisor_id = COALESCE(EXCLUDED.supervisor_id, push_tokens.supervisor_id),
             modelo = EXCLUDED.modelo,
             actualizado_en = NOW()`,
      [token, quien.deviceId, sectorId, quien.supervisorId ?? null, String(req.body?.modelo ?? '').slice(0, 120) || null]
    );
    // Un telefono tiene un solo token vivo: los viejos de ese mismo telefono sobran.
    await db.query('DELETE FROM push_tokens WHERE device_id = $1 AND token <> $2', [quien.deviceId, token]);
    return reply.send({ ok: true });
  };
  app.post('/api/push/token', registrar);
  app.post('/api/supervisor/push-token', registrar);

  // GET /api/admin/push/telefonos — quienes tienen notificaciones activas
  app.get('/api/admin/push/telefonos', { preHandler: verifyAdmin }, async (_req, reply) => {
    const r = await db.query(
      `SELECT pt.device_id, pt.modelo, pt.actualizado_en, s.name AS sector, d.encargado_name AS encargado
       FROM push_tokens pt
       LEFT JOIN sectors s ON s.id = pt.sector_id
       LEFT JOIN devices d ON d.device_id = pt.device_id
       ORDER BY pt.actualizado_en DESC`
    );
    return reply.send({ configurado: pushConfigurado(), telefonos: r.rows });
  });

  // POST /api/admin/push/prueba   body: { device_id? , sector_id?, todos?, titulo, cuerpo }
  // Para probar: manda una notificacion a un telefono, a un sector o a todos.
  app.post('/api/admin/push/prueba', { preHandler: verifyAdmin }, async (req, reply) => {
    const { device_id, sector_id, todos, titulo, cuerpo } = req.body ?? {};
    if (!titulo || !cuerpo) return reply.status(400).send({ error: 'titulo y cuerpo son requeridos' });
    let r;
    if (device_id) r = await db.query('SELECT token FROM push_tokens WHERE device_id = $1', [device_id]);
    else if (sector_id) r = await db.query('SELECT token FROM push_tokens WHERE sector_id = $1', [sector_id]);
    else if (todos === true) r = await db.query('SELECT token FROM push_tokens');
    else return reply.status(400).send({ error: 'Falta a quién: device_id, sector_id o todos:true' });
    const tokens = r.rows.map((x) => x.token);
    if (!tokens.length) return reply.send({ ok: true, enviadas: 0, fallidas: 0, aviso: 'Ningún teléfono con notificaciones activas' });
    try {
      const res = await mandarPush(tokens, { titulo, cuerpo, data: { tipo: 'prueba' } });
      return reply.send({ ok: true, ...res });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
