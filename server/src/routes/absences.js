import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';

function toDto(row) {
  return {
    id:           row.id,
    employee_id:  row.employee_id,
    start_date:   row.start_date,
    end_date:     row.end_date,
    // El DTO de Android espera Int (0 o 1), no boolean
    is_justified: row.is_justified ? 1 : 0,
    observations: row.observations ?? null,
  };
}

export async function absenceRoutes(app) {

  // POST /api/absences
  app.post('/api/absences', { preHandler: verifyDevice }, async (req, reply) => {
    const { employee_id, start_date, end_date, is_justified, observations } = req.body ?? {};
    if (!employee_id || !start_date || !end_date) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const emp = await db.query('SELECT id FROM employees WHERE id = $1', [employee_id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    const result = await db.query(
      `INSERT INTO absences (id, employee_id, start_date, end_date, is_justified, observations)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, employee_id, start_date, end_date, is_justified, observations`,
      [uuid(), employee_id, start_date, end_date, !!is_justified, observations ?? null]
    );

    return reply.status(201).send(toDto(result.rows[0]));
  });

  // GET /api/absences?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  app.get('/api/absences', { preHandler: verifyDevice }, async (req, reply) => {
    const { sectorId } = req.device;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT a.id, a.employee_id, a.start_date, a.end_date, a.is_justified, a.observations
      FROM absences a
      JOIN employees e ON e.id = a.employee_id
      WHERE e.sector_id = $1`;
    const params = [sectorId];
    let idx = 2;

    if (start_date) { query += ` AND a.end_date >= $${idx++}`;   params.push(start_date); }
    if (end_date)   { query += ` AND a.start_date <= $${idx++}`; params.push(end_date);   }
    query += ' ORDER BY a.start_date DESC';

    const result = await db.query(query, params);
    return reply.send({ absences: result.rows.map(toDto) });
  });
}
