import { db } from '../db.js';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';

export async function authRoutes(app) {

  // POST /api/auth/device/register
  app.post('/api/auth/device/register', async (req, reply) => {
    const { device_id, sector_id, encargado_name } = req.body ?? {};
    if (!device_id || !sector_id || !encargado_name) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const existing = await db.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (existing.rows[0]) {
      const device = existing.rows[0];
      if (device.approved && device.token) {
        return reply.send({ token: device.token });
      }
      return reply.send({ pending: true });
    }

    // Verificar que el sector existe
    const sectorCheck = await db.query('SELECT id FROM sectors WHERE id = $1', [sector_id]);
    if (!sectorCheck.rows[0]) {
      return reply.status(404).send({ error: 'Sector no encontrado' });
    }

    await db.query(
      `INSERT INTO devices (id, device_id, sector_id, encargado_name, approved)
       VALUES ($1, $2, $3, $4, false)`,
      [uuid(), device_id, sector_id, encargado_name]
    );

    return reply.send({ pending: true });
  });

  // GET /api/auth/device/allowed-sectors
  app.get('/api/auth/device/allowed-sectors', { preHandler: verifyDevice }, async (req, reply) => {
    const { sectorId } = req.device;
    const result = await db.query(
      'SELECT id, name, tipo_carga, encargado FROM sectors WHERE id = $1',
      [sectorId]
    );
    if (!result.rows[0]) {
      return reply.send({ ok: false, allowedSectors: [] });
    }
    const s = result.rows[0];
    return reply.send({
      ok: true,
      allowedSectors: [{
        id: s.id,
        name: s.name,
        tipoCarga: s.tipo_carga,
        encargado: s.encargado ?? null,
      }],
    });
  });
}
