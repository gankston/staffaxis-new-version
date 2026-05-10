import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';

export async function submissionRoutes(app) {

  // POST /api/submissions
  app.post('/api/submissions', { preHandler: verifyDevice }, async (req, reply) => {
    const { employee_id, date, minutes_worked, notes } = req.body ?? {};
    if (!employee_id || !date) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const emp = await db.query('SELECT sector_id FROM employees WHERE id = $1', [employee_id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    const id = uuid();
    await db.query(
      `INSERT INTO submissions (id, employee_id, sector_id, date, minutes_worked, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved')
       ON CONFLICT (employee_id, date) WHERE NOT is_deleted
       DO UPDATE SET minutes_worked = EXCLUDED.minutes_worked,
                     notes          = EXCLUDED.notes,
                     updated_at     = NOW()`,
      [id, employee_id, emp.rows[0].sector_id, date, minutes_worked ?? null, notes ?? null]
    );

    const saved = await db.query(
      'SELECT id, status FROM submissions WHERE employee_id = $1 AND date = $2 AND NOT is_deleted',
      [employee_id, date]
    );
    return reply.send({ id: saved.rows[0].id, status: saved.rows[0].status });
  });

  // GET /api/approved?since=<epoch_ms>&since_id=<uuid>&limit=<n>
  app.get('/api/approved', { preHandler: verifyDevice }, async (req, reply) => {
    const since   = parseInt(req.query.since   ?? '0', 10);
    const sinceId = req.query.since_id ?? null;
    const limit   = Math.min(parseInt(req.query.limit ?? '500', 10), 1000);
    const { sectorId } = req.device;

    const sinceTs = new Date(since).toISOString();

    let result;
    if (sinceId) {
      result = await db.query(
        `SELECT id, employee_id, sector_id, date, minutes_worked, notes,
                (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT AS updated_at_ms,
                is_deleted
         FROM submissions
         WHERE sector_id = $1
           AND (updated_at > $2 OR (updated_at = $2 AND id > $3))
         ORDER BY updated_at, id
         LIMIT $4`,
        [sectorId, sinceTs, sinceId, limit + 1]
      );
    } else {
      result = await db.query(
        `SELECT id, employee_id, sector_id, date, minutes_worked, notes,
                (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT AS updated_at_ms,
                is_deleted
         FROM submissions
         WHERE sector_id = $1 AND updated_at > $2
         ORDER BY updated_at, id
         LIMIT $3`,
        [sectorId, sinceTs, limit + 1]
      );
    }

    const hasMore = result.rows.length > limit;
    const items   = result.rows.slice(0, limit);
    const lastId  = items.length > 0 ? items[items.length - 1].id : null;

    return reply.send({
      items: items.map(r => ({
        id:            r.id,
        employeeId:    r.employee_id,
        sectorId:      r.sector_id,
        date:          r.date,
        minutesWorked: r.minutes_worked,
        notes:         r.notes,
        updatedAt:     Number(r.updated_at_ms),
        isDeleted:     r.is_deleted,
      })),
      hasMore,
      lastId,
    });
  });
}
