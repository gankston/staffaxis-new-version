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

    // Verificar que el sector existe
    const sectorCheck = await db.query('SELECT id FROM sectors WHERE id = $1', [sector_id]);
    if (!sectorCheck.rows[0]) {
      return reply.status(404).send({ error: 'Sector no encontrado' });
    }

    const existing = await db.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (existing.rows[0]) {
      const device = existing.rows[0];
      if (device.token) {
        return reply.send({ token: device.token });
      }
      // Dispositivo existente sin token → generar y aprobar ahora
      const token = jwt.sign(
        { deviceId: device_id, sectorId: sector_id, encargadoName: encargado_name },
        process.env.JWT_SECRET,
        { expiresIn: '365d' }
      );
      await db.query(
        'UPDATE devices SET token = $1, approved = true, sector_id = $2 WHERE device_id = $3',
        [token, sector_id, device_id]
      );
      return reply.send({ token });
    }

    // Nuevo dispositivo → auto-aprobar y generar token
    const token = jwt.sign(
      { deviceId: device_id, sectorId: sector_id, encargadoName: encargado_name },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    await db.query(
      `INSERT INTO devices (id, device_id, sector_id, encargado_name, token, approved)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [uuid(), device_id, sector_id, encargado_name, token]
    );

    return reply.send({ token });
  });

  // GET /api/auth/device/allowed-sectors
  app.get('/api/auth/device/allowed-sectors', { preHandler: verifyDevice }, async (req, reply) => {
    const { sectorId } = req.device;
    // Buscar el sector actual del dispositivo
    const own = await db.query(
      'SELECT id, name, tipo_carga, encargado, sector_group FROM sectors WHERE id = $1',
      [sectorId]
    );
    if (!own.rows[0]) return reply.send({ ok: false, allowedSectors: [] });

    const s = own.rows[0];
    let sectors = [s];

    // Si el sector pertenece a un grupo, devolver todos los sectores del grupo
    if (s.sector_group) {
      const grouped = await db.query(
        'SELECT id, name, tipo_carga, encargado, sector_group FROM sectors WHERE sector_group = $1 ORDER BY name',
        [s.sector_group]
      );
      sectors = grouped.rows;
    }

    return reply.send({
      ok: true,
      allowedSectors: sectors.map(sec => ({
        id: sec.id,
        name: sec.name,
        tipoCarga: sec.tipo_carga,
        encargado: sec.encargado ?? null,
      })),
    });
  });
}
