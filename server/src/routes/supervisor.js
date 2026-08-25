import { db } from '../db.js';
import { verifySupervisor } from '../middleware/auth.js';

// Helper: sectores que este supervisor tiene asignados (array de ids).
async function misSectores(supervisorId) {
  const r = await db.query('SELECT sector_id FROM supervisor_sectors WHERE supervisor_id = $1', [supervisorId]);
  return r.rows.map(x => x.sector_id);
}

export async function supervisorRoutes(app) {

  // GET /api/supervisor/me — identidad + sectores que supervisa
  app.get('/api/supervisor/me', { preHandler: verifySupervisor }, async (req, reply) => {
    const { supervisorId } = req.supervisor;
    const sup = await db.query('SELECT id, full_name FROM supervisors WHERE id = $1', [supervisorId]);
    if (!sup.rows[0]) return reply.status(404).send({ error: 'Supervisor no encontrado' });
    const sec = await db.query(
      `SELECT sec.id, sec.name FROM supervisor_sectors ss
       JOIN sectors sec ON sec.id = ss.sector_id
       WHERE ss.supervisor_id = $1 ORDER BY sec.name`,
      [supervisorId]
    );
    return reply.send({ id: sup.rows[0].id, full_name: sup.rows[0].full_name, sectores: sec.rows });
  });

  // GET /api/supervisor/pending — tarjas pendientes de aprobar en sus sectores
  app.get('/api/supervisor/pending', { preHandler: verifySupervisor }, async (req, reply) => {
    const sectores = await misSectores(req.supervisor.supervisorId);
    if (!sectores.length) return reply.send({ items: [] });

    const r = await db.query(
      `SELECT s.id, s.employee_id, s.date, s.minutes_worked, s.notes, s.created_at,
              -- Si se edito despues de cargarla, el supervisor tiene que saber que esta
              -- revisando una modificacion y no una tarja nueva.
              (s.updated_at > s.created_at + INTERVAL '1 minute') AS fue_modificada,
              s.horas, s.cosecha, s.cajas, s.cajones, s.importe,
              s.km_viajes, s.has_fumigadas, s.siembra_trilla, s.bolseros, s.etiquetado,
              s.carga_camion_kg50, s.carga_camion_kg25, s.carga_camion_otro,
              s.movimiento_estiba_kg50, s.movimiento_estiba_kg25, s.movimiento_estiba_otro,
              e.first_name, e.last_name, sec.name AS sector_name
       FROM submissions s
       JOIN employees e ON e.id = s.employee_id
       JOIN sectors sec ON sec.id = s.sector_id
       WHERE s.sector_id = ANY($1) AND s.status = 'pending' AND NOT s.is_deleted
       ORDER BY sec.name, s.date, e.last_name`,
      [sectores]
    );
    return reply.send({
      items: r.rows.map(x => ({
        id: x.id, employeeId: x.employee_id, empleado: `${x.last_name} ${x.first_name}`.trim(),
        sector: x.sector_name, date: x.date, minutesWorked: x.minutes_worked, notes: x.notes,
        createdAt: x.created_at,
        fueModificada: x.fue_modificada === true,
        kmViajes: x.km_viajes, hasFumigadas: x.has_fumigadas, siembraTrilla: x.siembra_trilla,
        bolseros: x.bolseros, etiquetado: x.etiquetado,
        cargaCamionKg50: x.carga_camion_kg50, cargaCamionKg25: x.carga_camion_kg25, cargaCamionOtro: x.carga_camion_otro,
        movimientoEstibaKg50: x.movimiento_estiba_kg50, movimientoEstibaKg25: x.movimiento_estiba_kg25, movimientoEstibaOtro: x.movimiento_estiba_otro,
      })),
    });
  });

  // POST /api/supervisor/approve   body: { submission_ids: [uuid, ...] }
  app.post('/api/supervisor/approve', { preHandler: verifySupervisor }, async (req, reply) => {
    const { submission_ids } = req.body ?? {};
    if (!Array.isArray(submission_ids) || !submission_ids.length) {
      return reply.status(400).send({ error: 'submission_ids requerido' });
    }
    const sectores = await misSectores(req.supervisor.supervisorId);
    // Solo toca tarjas que caigan dentro de los sectores que este supervisor tiene asignados —
    // aunque le manden ids de otro sector desde la app, ac no se cuelan.
    // Se guarda QUIEN aprobo y CUANDO: sin esto no habia forma de distinguir una tarja
    // revisada por un supervisor de una auto-aprobada que nadie miro (las dos quedaban
    // en 'approved' y StaffAdmin no podia mostrar nada util).
    const r = await db.query(
      `UPDATE submissions SET status = 'approved', aprobada_por = $3, aprobada_en = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND sector_id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [submission_ids, sectores, req.supervisor.supervisorId]
    );
    return reply.send({ ok: true, aprobadas: r.rowCount });
  });

  // POST /api/supervisor/reject   body: { submission_ids: [uuid, ...] }
  app.post('/api/supervisor/reject', { preHandler: verifySupervisor }, async (req, reply) => {
    const { submission_ids } = req.body ?? {};
    if (!Array.isArray(submission_ids) || !submission_ids.length) {
      return reply.status(400).send({ error: 'submission_ids requerido' });
    }
    const sectores = await misSectores(req.supervisor.supervisorId);
    const r = await db.query(
      `UPDATE submissions SET status = 'rejected', aprobada_por = $3, aprobada_en = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND sector_id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [submission_ids, sectores, req.supervisor.supervisorId]
    );
    return reply.send({ ok: true, rechazadas: r.rowCount });
  });

  // GET /api/supervisor/resumen?fecha_desde=&fecha_hasta=
  // Mismo dato que ve el que tarja con "Mostrar horas cargadas" (GET /api/admin/report),
  // pero acumulado en TODOS los sectores del supervisor, no uno solo.
  app.get('/api/supervisor/resumen', { preHandler: verifySupervisor }, async (req, reply) => {
    const { fecha_desde, fecha_hasta } = req.query ?? {};
    if (!fecha_desde || !fecha_hasta) {
      return reply.status(400).send({ error: 'fecha_desde y fecha_hasta son requeridos' });
    }
    const sectores = await misSectores(req.supervisor.supervisorId);
    if (!sectores.length) return reply.send({ rows: [] });

    const r = await db.query(
      `SELECT s.id AS submission_id, s.employee_id,
              e.first_name, e.last_name, e.dni,
              sec.id AS sector_id, sec.name AS sector_name,
              s.date, s.minutes_worked, s.notes, s.status,
              s.horas, s.cosecha, s.cajas, s.cajones, s.importe,
              s.km_viajes, s.has_fumigadas, s.siembra_trilla, s.bolseros, s.etiquetado,
              s.carga_camion_kg50, s.carga_camion_kg25, s.carga_camion_otro,
              s.movimiento_estiba_kg50, s.movimiento_estiba_kg25, s.movimiento_estiba_otro,
              s.latitude, s.longitude, s.created_at AS submitted_at
       FROM submissions s
       JOIN employees e  ON e.id  = s.employee_id
       JOIN sectors sec  ON sec.id = s.sector_id
       WHERE s.sector_id = ANY($1)
         AND s.date BETWEEN $2 AND $3
         AND NOT s.is_deleted
         AND e.is_active = true
       ORDER BY sec.name, e.last_name, e.first_name, s.date`,
      [sectores, fecha_desde, fecha_hasta]
    );
    return reply.send({ rows: r.rows });
  });
}
