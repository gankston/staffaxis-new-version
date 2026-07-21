import { db } from '../db.js';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { verifyAdmin } from '../middleware/auth.js';

export async function adminRoutes(app) {

  // ──────────────────────────────────────────────────────────────────────────
  // Dispositivos
  // ──────────────────────────────────────────────────────────────────────────

  // GET /api/admin/devices — lista todos los dispositivos
  app.get('/api/admin/devices', { preHandler: verifyAdmin }, async (_req, reply) => {
    const result = await db.query(
      `SELECT d.id, d.device_id, d.encargado_name, d.approved,
              d.created_at, s.name AS sector_name, s.id AS sector_id
       FROM devices d
       LEFT JOIN sectors s ON s.id = d.sector_id
       ORDER BY d.created_at DESC`
    );
    return reply.send({ devices: result.rows });
  });

  // POST /api/admin/devices/:id/approve — aprueba un dispositivo y genera token
  app.post('/api/admin/devices/:id/approve', { preHandler: verifyAdmin }, async (req, reply) => {
    const device = await db.query('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (!device.rows[0]) return reply.status(404).send({ error: 'Dispositivo no encontrado' });

    const d = device.rows[0];
    const token = jwt.sign(
      { deviceId: d.device_id, sectorId: d.sector_id, encargadoName: d.encargado_name },
      process.env.JWT_SECRET,
      { expiresIn: '10y' }
    );

    await db.query(
      'UPDATE devices SET approved = true, token = $1 WHERE id = $2',
      [token, d.id]
    );
    return reply.send({ ok: true, token });
  });

  // DELETE /api/admin/devices/:id — revoca acceso
  app.delete('/api/admin/devices/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    await db.query('UPDATE devices SET approved = false, token = NULL WHERE id = $1', [req.params.id]);
    return reply.send({ ok: true });
  });

  // POST /api/admin/login — valida el ADMIN_TOKEN y devuelve ok (legacy)
  app.post('/api/admin/login', async (req, reply) => {
    const { password } = req.body ?? {};
    if (!password || password !== process.env.ADMIN_TOKEN) {
      return reply.status(401).send({ success: false, error: 'Credenciales incorrectas' });
    }
    return reply.send({ success: true, token: process.env.ADMIN_TOKEN, user: { username: 'Admin' } });
  });

  // POST /api/admin/google-auth — verifica id_token de Google y devuelve ADMIN_TOKEN
  // El intercambio code→token se hace en el cliente Electron (Desktop app flow)
  app.post('/api/admin/google-auth', async (req, reply) => {
    const { id_token } = req.body ?? {};
    if (!id_token) {
      return reply.status(400).send({ error: 'id_token requerido' });
    }
    try {
      // Verificar el id_token con Google
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
      const payload = await verifyRes.json();
      if (payload.error || !payload.email) {
        return reply.status(401).send({ error: 'Token de Google inválido', detail: payload.error });
      }
      // Todos los usuarios de Google tienen acceso — devolvemos ADMIN_TOKEN
      return reply.send({
        success: true,
        token: process.env.ADMIN_TOKEN,
        user: { email: payload.email, name: payload.name, picture: payload.picture },
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Error interno', detail: String(err) });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sectores
  // ──────────────────────────────────────────────────────────────────────────

  app.get('/api/admin/sectors', { preHandler: verifyAdmin }, async (_req, reply) => {
    const result = await db.query('SELECT * FROM sectors ORDER BY name');
    return reply.send({ sectors: result.rows });
  });

  app.post('/api/admin/sectors', { preHandler: verifyAdmin }, async (req, reply) => {
    const { name, tipo_carga, encargado } = req.body ?? {};
    if (!name) return reply.status(400).send({ error: 'Nombre requerido' });
    const result = await db.query(
      `INSERT INTO sectors (id, name, tipo_carga, encargado)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [uuid(), name, tipo_carga ?? 'importe', encargado ?? null]
    );
    return reply.status(201).send(result.rows[0]);
  });

  app.delete('/api/admin/sectors/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    await db.query('DELETE FROM sectors WHERE id = $1', [req.params.id]);
    return reply.send({ ok: true });
  });

  app.put('/api/admin/sectors/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    const { name, tipo_carga, encargado, sector_group } = req.body ?? {};
    const result = await db.query(
      `UPDATE sectors SET name = COALESCE($1, name),
                          tipo_carga = COALESCE($2, tipo_carga),
                          encargado  = COALESCE($3, encargado),
                          sector_group = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE sector_group END
       WHERE id = $5 RETURNING *`,
      [name ?? null, tipo_carga ?? null, encargado ?? null, sector_group ?? null, req.params.id]
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Sector no encontrado' });
    return reply.send(result.rows[0]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Empleados (vista admin: todos los sectores)
  // ──────────────────────────────────────────────────────────────────────────

  // GET /api/admin/employees/search?q=texto — búsqueda global entre sectores
  app.get('/api/admin/employees/search', { preHandler: verifyAdmin }, async (req, reply) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return reply.send({ employees: [] });
    const result = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.dni, e.is_active, e.sector_id,
              s.name AS sector_name
       FROM employees e
       JOIN sectors s ON s.id = e.sector_id
       WHERE e.is_active = true
         AND (e.first_name ILIKE $1
              OR e.last_name  ILIKE $1
              OR CONCAT(e.first_name, ' ', e.last_name) ILIKE $1
              OR e.dni::text  ILIKE $1)
       ORDER BY e.last_name, e.first_name
       LIMIT 20`,
      [`%${q}%`]
    );
    return reply.send({ employees: result.rows });
  });

  app.get('/api/admin/employees', { preHandler: verifyAdmin }, async (req, reply) => {
    const sectorId = req.query.sector_id;
    let query = `SELECT e.*, s.name AS sector_name
                 FROM employees e JOIN sectors s ON s.id = e.sector_id
                 WHERE e.is_active = true`;
    const params = [];
    if (sectorId) { query += ' AND e.sector_id = $1'; params.push(sectorId); }
    query += ' ORDER BY s.name, e.first_name, e.last_name';
    const result = await db.query(query, params);
    return reply.send({ employees: result.rows });
  });

  app.post('/api/admin/employees', { preHandler: verifyAdmin }, async (req, reply) => {
    const { first_name, last_name, dni, sector_id } = req.body ?? {};
    if (!first_name || !sector_id) return reply.status(400).send({ error: 'Faltan campos' });
    const result = await db.query(
      `INSERT INTO employees (id, sector_id, first_name, last_name, dni)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uuid(), sector_id, first_name, last_name ?? '', dni?.trim() || null]
    );
    return reply.status(201).send(result.rows[0]);
  });

  app.put('/api/admin/employees/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    const { first_name, last_name, dni, is_active, sector_id } = req.body ?? {};
    const fields = [], values = [];
    let idx = 1;
    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name); }
    if (last_name  !== undefined) { fields.push(`last_name  = $${idx++}`); values.push(last_name); }
    if (dni        !== undefined) { fields.push(`dni        = $${idx++}`); values.push(dni || null); }
    if (is_active  !== undefined) { fields.push(`is_active  = $${idx++}`); values.push(is_active); }
    if (sector_id  !== undefined) { fields.push(`sector_id  = $${idx++}`); values.push(sector_id); }
    if (!fields.length) return reply.status(400).send({ error: 'Nada para actualizar' });
    values.push(req.params.id);
    const result = await db.query(
      `UPDATE employees SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });
    return reply.send(result.rows[0]);
  });

  // DELETE /api/admin/employees/:id — elimina permanentemente el empleado y sus registros
  app.delete('/api/admin/employees/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const emp = await db.query('SELECT id FROM employees WHERE id = $1', [id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });
    await db.query('DELETE FROM submissions WHERE employee_id = $1', [id]);
    await db.query('DELETE FROM absences WHERE employee_id = $1', [id]);
    await db.query('DELETE FROM transfers WHERE employee_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM employees WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Reportes (resumen por sector y fecha para StaffAdmin)
  // ──────────────────────────────────────────────────────────────────────────

  // GET /api/admin/report?sector_id=X&start_date=Y&end_date=Z
  app.get('/api/admin/report', { preHandler: verifyAdmin }, async (req, reply) => {
    const { sector_id, start_date, end_date } = req.query;
    if (!sector_id || !start_date || !end_date) {
      return reply.status(400).send({ error: 'sector_id, start_date y end_date son requeridos' });
    }
    const result = await db.query(
      `SELECT s.id AS submission_id, s.employee_id,
              e.first_name, e.last_name, e.dni,
              e.sector_id AS current_sector_id,
              cs.name     AS current_sector_name,
              s.date, s.minutes_worked, s.notes
       FROM submissions s
       JOIN employees e  ON e.id  = s.employee_id
       LEFT JOIN sectors cs ON cs.id = e.sector_id
       WHERE s.sector_id = $1
         AND s.date BETWEEN $2 AND $3
         AND NOT s.is_deleted
         AND e.is_active = true
       ORDER BY e.last_name, e.first_name, s.date`,
      [sector_id, start_date, end_date]
    );
    return reply.send({ rows: result.rows });
  });

  // GET /api/admin/absences?sector_id=X&start_date=Y&end_date=Z
  app.get('/api/admin/absences', { preHandler: verifyAdmin }, async (req, reply) => {
    const { sector_id, start_date, end_date } = req.query;
    if (!sector_id) return reply.status(400).send({ error: 'sector_id requerido' });
    let query = `
      SELECT a.id, e.first_name, e.last_name, e.dni,
             a.start_date, a.end_date, a.is_justified, a.observations
      FROM absences a
      JOIN employees e ON e.id = a.employee_id
      WHERE e.sector_id = $1 AND e.is_active = true`;
    const params = [sector_id];
    let idx = 2;
    if (start_date) { query += ` AND a.end_date >= $${idx++}`;   params.push(start_date); }
    if (end_date)   { query += ` AND a.start_date <= $${idx++}`; params.push(end_date); }
    query += ' ORDER BY a.start_date DESC';
    const result = await db.query(query, params);
    return reply.send({ absences: result.rows });
  });

  // GET /api/admin/transfers?sector_id=X&start_date=Y&end_date=Z
  // Devuelve traslados que involucran este sector (salientes y entrantes) en el período
  app.get('/api/admin/transfers', { preHandler: verifyAdmin }, async (req, reply) => {
    const { sector_id, start_date, end_date } = req.query;
    if (!sector_id) return reply.status(400).send({ error: 'sector_id requerido' });

    const result = await db.query(
      `SELECT t.id, t.employee_id, t.from_sector_id, t.to_sector_id, t.transferred_at,
              e.first_name, e.last_name, e.dni,
              sf.name AS from_sector_name,
              st.name AS to_sector_name
       FROM transfers t
       JOIN employees e  ON e.id  = t.employee_id
       LEFT JOIN sectors sf ON sf.id = t.from_sector_id
       LEFT JOIN sectors st ON st.id = t.to_sector_id
       WHERE (t.from_sector_id = $1 OR t.to_sector_id = $1)
         AND ($2::date IS NULL OR t.transferred_at::date >= $2::date)
         AND ($3::date IS NULL OR t.transferred_at::date <= $3::date)
       ORDER BY t.transferred_at DESC`,
      [sector_id, start_date ?? null, end_date ?? null]
    );
    return reply.send({ transfers: result.rows });
  });
}
