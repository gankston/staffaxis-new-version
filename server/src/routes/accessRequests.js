import { db } from '../db.js';
import jwt from 'jsonwebtoken';
import { verifyAdmin } from '../middleware/auth.js';

// Genera el mismo tipo de token que /api/auth/device/register (365 dias), para
// que el flujo nuevo entregue exactamente lo mismo que espera la app.
function issueToken(deviceId, sectorId, fullName) {
  return jwt.sign(
    { deviceId, sectorId, encargadoName: fullName },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );
}

function issueSupervisorToken(deviceId, supervisorId, fullName) {
  return jwt.sign(
    { deviceId, supervisorId, fullName, tipo: 'supervisor' },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );
}

async function upsertAuthorizedDevice(deviceId, sectorId, fullName, phoneModel) {
  const token = issueToken(deviceId, sectorId, fullName);
  await db.query(
    `INSERT INTO devices (device_id, sector_id, encargado_name, token, approved, revoked, phone_model)
     VALUES ($1, $2, $3, $4, true, false, $5)
     ON CONFLICT (device_id) DO UPDATE SET
       sector_id = EXCLUDED.sector_id,
       encargado_name = EXCLUDED.encargado_name,
       token = EXCLUDED.token,
       approved = true,
       revoked = false,
       phone_model = COALESCE(EXCLUDED.phone_model, devices.phone_model)`,
    [deviceId, sectorId, fullName, token, phoneModel ?? null]
  );
  return token;
}

// Igual que arriba pero del lado del supervisor: no tiene sector_id (una fila en
// devices), el vinculo dispositivo<->supervisor vive directo en supervisors.device_id.
async function upsertAuthorizedSupervisor(deviceId, supervisorId, fullName, phoneModel) {
  const token = issueSupervisorToken(deviceId, supervisorId, fullName);
  await db.query(
    `UPDATE supervisors SET device_id = $1, token = $2, revoked = false,
            phone_model = COALESCE($3, phone_model)
     WHERE id = $4`,
    [deviceId, token, phoneModel ?? null, supervisorId]
  );
  return token;
}

export async function accessRequestRoutes(app) {

  // ─────────────────────────────────────────────────────────────────────────
  // Lado APP — dispositivos que tarjan (flujo de siempre)
  // ─────────────────────────────────────────────────────────────────────────

  // POST /api/auth/request-access
  // body: { device_id, sector_id, full_name, phone_model?, latitude?, longitude? }
  app.post('/api/auth/request-access', async (req, reply) => {
    const { device_id, sector_id, full_name, phone_model, latitude, longitude } = req.body ?? {};
    if (!device_id || !sector_id || !full_name?.trim()) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const sectorCheck = await db.query('SELECT id FROM sectors WHERE id = $1', [sector_id]);
    if (!sectorCheck.rows[0]) {
      return reply.status(404).send({ error: 'Sector no encontrado' });
    }

    // Dispositivo maestro o ya autorizado y no revocado -> pasa directo, sin pedido pendiente.
    const existing = await db.query('SELECT * FROM devices WHERE device_id = $1', [device_id]);
    const dev = existing.rows[0];
    if (dev && !dev.revoked && (dev.is_master || dev.approved)) {
      const token = await upsertAuthorizedDevice(device_id, sector_id, full_name.trim(), phone_model);
      return reply.send({ status: 'authorized', token, is_master: dev.is_master === true });
    }

    // Si ya hay un pedido pendiente de este mismo dispositivo no se duplica: se pisa
    // con los datos nuevos. Si alguien se equivoco de sector (o escribio mal el nombre)
    // y vuelve a pedir, lo que vale es el ultimo pedido — antes se ignoraba la
    // correccion y terminaba autorizado en el sector viejo.
    const pending = await db.query(
      `SELECT id FROM access_requests WHERE device_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [device_id]
    );
    if (pending.rows[0]) {
      await db.query(
        `UPDATE access_requests
            SET sector_id     = $1,
                supervisor_id = NULL,
                full_name     = $2,
                phone_model   = COALESCE($3, phone_model),
                latitude      = COALESCE($4, latitude),
                longitude     = COALESCE($5, longitude),
                created_at    = NOW()
          WHERE id = $6`,
        [sector_id, full_name.trim(), phone_model ?? null, latitude ?? null, longitude ?? null, pending.rows[0].id]
      );
      return reply.send({ status: 'pending', request_id: pending.rows[0].id });
    }

    const ins = await db.query(
      `INSERT INTO access_requests (sector_id, device_id, full_name, phone_model, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [sector_id, device_id, full_name.trim(), phone_model ?? null, latitude ?? null, longitude ?? null]
    );

    return reply.send({ status: 'pending', request_id: ins.rows[0].id });
  });

  // GET /api/auth/request-access/:id — la app hace polling de esto
  app.get('/api/auth/request-access/:id', async (req, reply) => {
    const { id } = req.params;
    const r = await db.query('SELECT * FROM access_requests WHERE id = $1', [id]);
    const reqRow = r.rows[0];
    if (!reqRow) return reply.status(404).send({ error: 'Solicitud no encontrada' });

    if (reqRow.status === 'pending') {
      return reply.send({ status: 'pending' });
    }
    if (reqRow.status === 'rejected') {
      return reply.send({ status: 'rejected' });
    }

    // authorized -> traer el token vigente del device
    const dev = await db.query('SELECT token, revoked, is_master FROM devices WHERE device_id = $1', [reqRow.device_id]);
    if (!dev.rows[0] || dev.rows[0].revoked) {
      return reply.send({ status: 'rejected' }); // revocado entre medio, no darle token
    }
    return reply.send({ status: 'authorized', token: dev.rows[0].token, is_master: dev.rows[0].is_master === true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lado APP — supervisores. Mismo patron de UX (elegir nombre, pedir, esperar),
  // pero el nombre sale de una lista cerrada (tabla supervisors, la armamos
  // nosotros) y no esta atado a un solo sector sino a los que le asignamos.
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/auth/supervisors — para el dropdown de "entrar como supervisor"
  app.get('/api/auth/supervisors', async (_req, reply) => {
    const r = await db.query(`SELECT id, full_name FROM supervisors WHERE active = true ORDER BY full_name`);
    return reply.send({ supervisors: r.rows });
  });

  // POST /api/auth/request-access-supervisor
  // body: { device_id, supervisor_id, phone_model?, latitude?, longitude? }
  app.post('/api/auth/request-access-supervisor', async (req, reply) => {
    const { device_id, supervisor_id, phone_model, latitude, longitude } = req.body ?? {};
    if (!device_id || !supervisor_id) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const sup = await db.query('SELECT * FROM supervisors WHERE id = $1 AND active = true', [supervisor_id]);
    if (!sup.rows[0]) return reply.status(404).send({ error: 'Supervisor no encontrado' });
    const fullName = sup.rows[0].full_name;

    // Ya autorizado en este mismo dispositivo y no revocado -> pasa directo.
    if (sup.rows[0].device_id === device_id && !sup.rows[0].revoked) {
      const token = await upsertAuthorizedSupervisor(device_id, supervisor_id, fullName, phone_model);
      return reply.send({ status: 'authorized', token });
    }

    const pending = await db.query(
      `SELECT id FROM access_requests WHERE device_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [device_id]
    );
    if (pending.rows[0]) {
      await db.query(
        `UPDATE access_requests
            SET supervisor_id = $1,
                sector_id     = NULL,
                full_name     = $2,
                phone_model   = COALESCE($3, phone_model),
                latitude      = COALESCE($4, latitude),
                longitude     = COALESCE($5, longitude),
                created_at    = NOW()
          WHERE id = $6`,
        [supervisor_id, fullName, phone_model ?? null, latitude ?? null, longitude ?? null, pending.rows[0].id]
      );
      return reply.send({ status: 'pending', request_id: pending.rows[0].id });
    }

    const ins = await db.query(
      `INSERT INTO access_requests (supervisor_id, device_id, full_name, phone_model, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [supervisor_id, device_id, fullName, phone_model ?? null, latitude ?? null, longitude ?? null]
    );
    return reply.send({ status: 'pending', request_id: ins.rows[0].id });
  });

  // GET /api/auth/request-access-supervisor/:id — polling
  app.get('/api/auth/request-access-supervisor/:id', async (req, reply) => {
    const { id } = req.params;
    const r = await db.query('SELECT * FROM access_requests WHERE id = $1', [id]);
    const reqRow = r.rows[0];
    if (!reqRow) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (reqRow.status === 'pending') return reply.send({ status: 'pending' });
    if (reqRow.status === 'rejected') return reply.send({ status: 'rejected' });

    const sup = await db.query('SELECT token, revoked FROM supervisors WHERE id = $1', [reqRow.supervisor_id]);
    if (!sup.rows[0] || sup.rows[0].revoked) return reply.send({ status: 'rejected' });
    return reply.send({ status: 'authorized', token: sup.rows[0].token });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lado STAFFADMIN
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/admin/access-requests?status=pending
  // Una sola cola para las dos cosas — cada fila trae "tipo" (empleado|supervisor)
  // para que StaffAdmin lo distinga. Las de supervisor traen la lista de sectores
  // que le corresponden (via supervisor_sectors), no un sector_name unico.
  app.get('/api/admin/access-requests', { preHandler: verifyAdmin }, async (req, reply) => {
    const status = req.query?.status || 'pending';
    const r = await db.query(
      `SELECT ar.id, ar.full_name, ar.phone_model, ar.latitude, ar.longitude,
              ar.status, ar.authorized_by, ar.authorized_at, ar.created_at,
              ar.device_id, ar.sector_id, ar.supervisor_id,
              s.name AS sector_name,
              CASE WHEN ar.supervisor_id IS NOT NULL THEN 'supervisor' ELSE 'empleado' END AS tipo,
              (SELECT COALESCE(ARRAY_AGG(sec.name ORDER BY sec.name), '{}')
                 FROM supervisor_sectors ss JOIN sectors sec ON sec.id = ss.sector_id
                WHERE ss.supervisor_id = ar.supervisor_id) AS sectores_supervisor
       FROM access_requests ar
       LEFT JOIN sectors s ON s.id = ar.sector_id
       WHERE ar.status = $1
       ORDER BY ar.created_at DESC`,
      [status]
    );
    return reply.send({ requests: r.rows });
  });

  // POST /api/admin/access-requests/:id/authorize   body: { admin_email }
  app.post('/api/admin/access-requests/:id/authorize', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { admin_email } = req.body ?? {};
    if (!admin_email) return reply.status(400).send({ error: 'admin_email requerido' });

    const r = await db.query(`SELECT * FROM access_requests WHERE id = $1`, [id]);
    const reqRow = r.rows[0];
    if (!reqRow) return reply.status(404).send({ error: 'Solicitud no encontrada' });
    if (reqRow.status !== 'pending') return reply.status(409).send({ error: 'La solicitud ya fue resuelta' });

    if (reqRow.supervisor_id) {
      await upsertAuthorizedSupervisor(reqRow.device_id, reqRow.supervisor_id, reqRow.full_name, reqRow.phone_model);
    } else {
      await upsertAuthorizedDevice(reqRow.device_id, reqRow.sector_id, reqRow.full_name, reqRow.phone_model);
    }

    await db.query(
      `UPDATE access_requests SET status = 'authorized', authorized_by = $1, authorized_at = NOW() WHERE id = $2`,
      [admin_email, id]
    );

    return reply.send({ ok: true });
  });

  // POST /api/admin/access-requests/:id/reject   body: { admin_email }
  app.post('/api/admin/access-requests/:id/reject', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const { admin_email } = req.body ?? {};
    if (!admin_email) return reply.status(400).send({ error: 'admin_email requerido' });

    const r = await db.query(
      `UPDATE access_requests SET status = 'rejected', authorized_by = $1, authorized_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING id`,
      [admin_email, id]
    );
    if (!r.rows[0]) return reply.status(409).send({ error: 'La solicitud ya fue resuelta o no existe' });

    return reply.send({ ok: true });
  });

  // (GET /api/admin/devices ya existe en admin.js — se le agregaron ahi las
  // columnas is_master/revoked/phone_model en vez de duplicar la ruta aca)

  // GET /api/admin/supervisors — listado para el panel de StaffAdmin
  app.get('/api/admin/supervisors', { preHandler: verifyAdmin }, async (_req, reply) => {
    const r = await db.query(
      `SELECT sv.id, sv.full_name, sv.device_id, sv.active, sv.revoked, sv.phone_model, sv.created_at,
              (SELECT COALESCE(ARRAY_AGG(sec.name ORDER BY sec.name), '{}')
                 FROM supervisor_sectors ss JOIN sectors sec ON sec.id = ss.sector_id
                WHERE ss.supervisor_id = sv.id) AS sectores
       FROM supervisors sv ORDER BY sv.full_name`
    );
    return reply.send({ supervisors: r.rows });
  });

  // POST /api/admin/devices/:id/revoke
  app.post('/api/admin/devices/:id/revoke', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const r = await db.query(`UPDATE devices SET revoked = true WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return reply.status(404).send({ error: 'Dispositivo no encontrado' });
    return reply.send({ ok: true });
  });

  // POST /api/admin/devices/:id/unrevoke — por si se revoca por error
  app.post('/api/admin/devices/:id/unrevoke', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const r = await db.query(`UPDATE devices SET revoked = false WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return reply.status(404).send({ error: 'Dispositivo no encontrado' });
    return reply.send({ ok: true });
  });

  // POST /api/admin/supervisors/:id/revoke — corta el acceso del supervisor en caliente
  app.post('/api/admin/supervisors/:id/revoke', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const r = await db.query(`UPDATE supervisors SET revoked = true WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return reply.status(404).send({ error: 'Supervisor no encontrado' });
    return reply.send({ ok: true });
  });

  // POST /api/admin/supervisors/:id/unrevoke
  app.post('/api/admin/supervisors/:id/unrevoke', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    const r = await db.query(`UPDATE supervisors SET revoked = false WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return reply.status(404).send({ error: 'Supervisor no encontrado' });
    return reply.send({ ok: true });
  });
}
