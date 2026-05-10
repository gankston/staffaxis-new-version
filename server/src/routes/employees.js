import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';

function toDto(row) {
  return {
    id: row.id,
    sector_id: row.sector_id,
    first_name: row.first_name,
    last_name: row.last_name,
    dni: row.dni ?? null,
    is_active: row.is_active,
  };
}

export async function employeeRoutes(app) {

  // GET /api/employees?sector_id=X
  app.get('/api/employees', { preHandler: verifyDevice }, async (req, reply) => {
    const sectorId = req.query.sector_id ?? req.device.sectorId;
    const result = await db.query(
      `SELECT id, sector_id, first_name, last_name, dni, is_active
       FROM employees WHERE sector_id = $1 ORDER BY first_name, last_name`,
      [sectorId]
    );
    return reply.send({ employees: result.rows.map(toDto) });
  });

  // POST /api/employees
  app.post('/api/employees', { preHandler: verifyDevice }, async (req, reply) => {
    const { first_name, last_name, dni, sector_id, force_transfer } = req.body ?? {};
    if (!first_name || !sector_id) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const dniValue = dni?.trim() || null;

    // ¿Existe en el mismo sector?
    if (!force_transfer && dniValue) {
      const same = await db.query(
        'SELECT id FROM employees WHERE dni = $1 AND sector_id = $2 AND is_active = true',
        [dniValue, sector_id]
      );
      if (same.rows[0]) return reply.status(409).send({ error: 'Empleado ya existe en este sector' });
    }

    // ¿Existe en otro sector?
    if (dniValue) {
      const other = await db.query(
        'SELECT id, sector_id FROM employees WHERE dni = $1 AND sector_id != $2 AND is_active = true',
        [dniValue, sector_id]
      );
      if (other.rows[0] && !force_transfer) {
        return reply.status(422).send({ error: 'Empleado existe en otro sector', code: 'EXISTS_OTHER_SECTOR' });
      }
      if (other.rows[0] && force_transfer) {
        // Transferencia: mover al nuevo sector
        const updated = await db.query(
          `UPDATE employees SET sector_id = $1, updated_at = NOW()
           WHERE id = $2 RETURNING id, sector_id, first_name, last_name, dni, is_active`,
          [sector_id, other.rows[0].id]
        );
        return reply.send(toDto(updated.rows[0]));
      }
    }

    const result = await db.query(
      `INSERT INTO employees (id, sector_id, first_name, last_name, dni)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sector_id, first_name, last_name, dni, is_active`,
      [uuid(), sector_id, first_name, last_name ?? '', dniValue]
    );
    return reply.status(201).send(toDto(result.rows[0]));
  });

  // PUT /api/employees/:id
  app.put('/api/employees/:id', { preHandler: verifyDevice }, async (req, reply) => {
    const { id } = req.params;
    const { first_name, last_name, dni, is_active } = req.body ?? {};

    const fields = [];
    const values = [];
    let idx = 1;

    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name); }
    if (last_name  !== undefined) { fields.push(`last_name  = $${idx++}`); values.push(last_name);  }
    if (dni        !== undefined) { fields.push(`dni        = $${idx++}`); values.push(dni || null); }
    if (is_active  !== undefined) { fields.push(`is_active  = $${idx++}`); values.push(is_active);  }

    if (!fields.length) return reply.status(400).send({ error: 'Nada para actualizar' });

    values.push(id);
    const result = await db.query(
      `UPDATE employees SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING id, sector_id, first_name, last_name, dni, is_active`,
      values
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });
    return reply.send(toDto(result.rows[0]));
  });
}
