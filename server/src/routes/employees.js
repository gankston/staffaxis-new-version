import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';
import { normalizarDni, formatoDniValido } from '../lib/dniUtils.js';

function toDto(row) {
  return {
    id: row.id,
    sector_id: row.sector_id,
    first_name: row.first_name,
    last_name: row.last_name,
    dni: row.dni ?? null,
    is_active: row.is_active,
    tiene_foto_frente: !!row.dni_foto_frente,
    tiene_foto_dorso: !!row.dni_foto_dorso,
  };
}

export async function employeeRoutes(app) {

  // GET /api/employees?sector_id=X — acepta device JWT o admin token
  app.get('/api/employees', async (req, reply) => {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken) {
      if (adminToken !== process.env.ADMIN_TOKEN) {
        return reply.status(401).send({ error: 'Token de administrador inválido' });
      }
    } else {
      // Validar device token
      const auth = req.headers['authorization'];
      if (!auth?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'No autorizado' });
      }
      let payload;
      try {
        const jwt = await import('jsonwebtoken');
        payload = jwt.default.verify(auth.slice(7), process.env.JWT_SECRET);
      } catch {
        return reply.status(401).send({ error: 'Token inválido o expirado' });
      }
      // Mismo chequeo de revocacion en caliente que verifyDevice — este endpoint
      // hacia su propia validacion de JWT y se salteaba este control.
      try {
        const r = await db.query('SELECT revoked FROM devices WHERE device_id = $1', [payload.deviceId]);
        if (r.rows[0]?.revoked) {
          return reply.status(403).send({ error: 'Dispositivo revocado', revoked: true });
        }
      } catch (err) {
        req.log?.error?.('GET /api/employees: fallo chequeo de revocacion: ' + err.message);
      }
      req.device = payload;
    }
    const sectorId = req.query.sector_id ?? req.device?.sectorId;
    const result = await db.query(
      `SELECT id, sector_id, first_name, last_name, dni, is_active, dni_foto_frente, dni_foto_dorso
       FROM employees WHERE sector_id = $1 ORDER BY last_name, first_name`,
      [sectorId]
    );
    return reply.send({ employees: result.rows.map(toDto) });
  });

  // GET /api/employees/buscar?dni=X — busca en TODOS los sectores.
  //
  // La lista comun solo devuelve el sector propio, asi que no habia forma de
  // saber si un tipo que se presenta a trabajar ya existe en otro lado. Sin
  // esto, el encargado lo daba de alta de nuevo y quedaba la ficha duplicada.
  app.get('/api/employees/buscar', { preHandler: verifyDevice }, async (req, reply) => {
    const dni = normalizarDni(req.query?.dni);
    // Buscar solo pide que sea un numero de largo razonable. Las reglas de
    // patron (no todos iguales, no secuencias) son para dar de ALTA: aplicarlas
    // aca solo lograria que una ficha vieja con un DNI raro no se pueda
    // encontrar nunca, que es justo lo contrario de lo que buscamos.
    if (!dni || dni.length < 7 || dni.length > 9) {
      return reply.status(400).send({ error: 'El DNI tiene que tener entre 7 y 9 dígitos' });
    }
    const r = await db.query(
      `SELECT e.id, e.sector_id, e.first_name, e.last_name, e.dni, e.is_active,
              e.dni_foto_frente, e.dni_foto_dorso, s.name AS sector_name
         FROM employees e LEFT JOIN sectors s ON s.id = e.sector_id
        WHERE e.dni = $1
        ORDER BY e.is_active DESC, e.updated_at DESC NULLS LAST`,
      [dni]
    );
    return reply.send({
      rows: r.rows.map((row) => ({
        ...toDto(row),
        sector_name: row.sector_name,
        es_de_mi_sector: row.sector_id === req.device.sectorId,
      })),
    });
  });

  // POST /api/employees/:id/mover — trae UNA ficha concreta al sector del equipo.
  //
  // Va por id y no por DNI a proposito: la transferencia de POST /api/employees
  // solo mira fichas activas, asi que con un empleado dado de baja en el otro
  // sector terminaba creando una ficha nueva en vez de moverlo — un duplicado
  // mas. Aca se mueve la ficha que el encargado vio en pantalla, y si estaba
  // inactiva se reactiva, que es lo que quiere decir traerla.
  app.post('/api/employees/:id/mover', { preHandler: verifyDevice }, async (req, reply) => {
    const destino = req.device.sectorId;
    if (!destino) return reply.status(400).send({ error: 'El equipo no tiene sector asignado' });

    const actual = await db.query('SELECT id, sector_id, is_active FROM employees WHERE id = $1', [req.params.id]);
    if (!actual.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    const origen = actual.rows[0].sector_id;
    if (origen === destino && actual.rows[0].is_active) {
      return reply.status(409).send({ error: 'El empleado ya está en tu sector' });
    }

    const movido = await db.query(
      `UPDATE employees SET sector_id = $1, is_active = true, updated_at = NOW()
        WHERE id = $2
    RETURNING id, sector_id, first_name, last_name, dni, is_active, dni_foto_frente, dni_foto_dorso`,
      [destino, req.params.id]
    );

    if (origen !== destino) {
      // Queda registrado para que el export muestre "Se fue a X" / "Viene de Y"
      await db.query(
        'INSERT INTO transfers (employee_id, from_sector_id, to_sector_id) VALUES ($1, $2, $3)',
        [req.params.id, origen, destino]
      ).catch(() => {});
    }
    return reply.send(toDto(movido.rows[0]));
  });

  // POST /api/employees
  app.post('/api/employees', { preHandler: verifyDevice }, async (req, reply) => {
    const { first_name, last_name, dni, sector_id, force_transfer } = req.body ?? {};
    if (!first_name || !sector_id) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const dniValue = normalizarDni(dni);
    // Pedido de IT Salvita: la via de alta sin DNI es la que generaba fichas
    // imposibles de cruzar con el padron de RRHH. Ya no se puede dar de alta
    // a nadie sin documento por esta ruta.
    if (!dniValue) {
      return reply.status(400).send({ error: 'El DNI es obligatorio' });
    }
    if (!formatoDniValido(dniValue)) {
      return reply.status(400).send({ error: 'El DNI no tiene un formato válido (7 a 9 dígitos)' });
    }

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
        const fromSectorId = other.rows[0].sector_id;
        const updated = await db.query(
          `UPDATE employees SET sector_id = $1, updated_at = NOW()
           WHERE id = $2 RETURNING id, sector_id, first_name, last_name, dni, is_active, dni_foto_frente, dni_foto_dorso`,
          [sector_id, other.rows[0].id]
        );
        // Registrar el traslado para que el export muestre "Se fue a X" / "Viene de Y"
        await db.query(
          `INSERT INTO transfers (employee_id, from_sector_id, to_sector_id)
           VALUES ($1, $2, $3)`,
          [other.rows[0].id, fromSectorId, sector_id]
        ).catch(() => {}); // no rompe el traslado si falla el log
        return reply.send(toDto(updated.rows[0]));
      }
    }

    const result = await db.query(
      `INSERT INTO employees (id, sector_id, first_name, last_name, dni)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sector_id, first_name, last_name, dni, is_active, dni_foto_frente, dni_foto_dorso`,
      [uuid(), sector_id, first_name, last_name ?? '', dniValue]
    );
    return reply.status(201).send(toDto(result.rows[0]));
  });

  // PUT /api/employees/:id
  app.put('/api/employees/:id', { preHandler: verifyDevice }, async (req, reply) => {
    const { id } = req.params;
    const { first_name, last_name, dni, is_active } = req.body ?? {};

    // Validar el DNI si se lo esta editando — este endpoint nunca lo chequeaba, a
    // diferencia del POST de arriba que si valida al crear. Completar/corregir el DNI
    // de un empleado ya existente (p.ej. desde "Editar Empleado") con uno que ya
    // pertenece a otro activo se guardaba sin avisar, y asi terminaban dos fichas
    // reales con tarjas cargadas en las dos (ver auditoria de DNIs duplicados).
    let dniValue;
    if (dni !== undefined) {
      dniValue = normalizarDni(dni);
      if (dniValue) {
        if (!formatoDniValido(dniValue)) {
          return reply.status(400).send({ error: 'El DNI no tiene un formato válido (7 a 9 dígitos)' });
        }
        const current = await db.query('SELECT sector_id FROM employees WHERE id = $1', [id]);
        if (!current.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });
        const sectorId = current.rows[0].sector_id;

        const mismoSector = await db.query(
          'SELECT id FROM employees WHERE dni = $1 AND sector_id = $2 AND is_active = true AND id != $3',
          [dniValue, sectorId, id]
        );
        if (mismoSector.rows[0]) {
          return reply.status(409).send({ error: 'Ya hay un empleado activo con ese DNI en este sector' });
        }

        const otroSector = await db.query(
          'SELECT id FROM employees WHERE dni = $1 AND sector_id != $2 AND is_active = true AND id != $3',
          [dniValue, sectorId, id]
        );
        if (otroSector.rows[0]) {
          return reply.status(422).send({ error: 'Ese DNI ya pertenece a un empleado activo en otro sector', code: 'EXISTS_OTHER_SECTOR' });
        }
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name); }
    if (last_name  !== undefined) { fields.push(`last_name  = $${idx++}`); values.push(last_name);  }
    if (dni        !== undefined) { fields.push(`dni        = $${idx++}`); values.push(dniValue);  }
    if (is_active  !== undefined) { fields.push(`is_active  = $${idx++}`); values.push(is_active);  }

    if (!fields.length) return reply.status(400).send({ error: 'Nada para actualizar' });

    values.push(id);
    const result = await db.query(
      `UPDATE employees SET ${fields.join(', ')}
       WHERE id = $${idx} RETURNING id, sector_id, first_name, last_name, dni, is_active, dni_foto_frente, dni_foto_dorso`,
      values
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });
    return reply.send(toDto(result.rows[0]));
  });
}
