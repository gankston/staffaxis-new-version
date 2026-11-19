/**
 * Tarja Fuera de Término (pedido 19/11/2026).
 *
 * Para los dias que el encargado ya no puede tarjar por la carga normal (hoy y
 * ayer; OTITO tres dias). El encargado arma un pedido con MOTIVO y FECHAS, carga
 * las horas con el formulario de siempre y lo manda. Las horas quedan aparte, en
 * fuera_termino_items: NO estan en submissions, asi que no aparecen en el Excel
 * ni en la liquidacion hasta que se autoricen.
 *
 * Recorrido (no es la aprobacion de supervisores, va por otro lado):
 *   borrador ──enviar──> esperando_verificacion ──Facundo confirma──> esperando_rrhh
 *                                     │                                   │
 *                                     └─no confirma─> no_autorizada        ├─RRHH autoriza─> autorizada
 *                                                                          └─RRHH no──────> no_autorizada
 *
 * Motivos: "Sin internet" y "Sin luz" los verifica primero el responsable de
 * los cortes (Facundo Zingone) desde StaffAxis; despues dan el OK final RRHH
 * (Karina o Carolina) en StaffAdmin. "Incumplimiento de carga" queda para
 * despues (falta definir su recorrido).
 *
 * Quien verifica y quien autoriza esta en la tabla `autorizantes` (rol
 * 'verificador' con device_id del telefono, rol 'rrhh' con el mail de Google con
 * el que entra a StaffAdmin). Cambiar a la persona es cambiar la tabla.
 */
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { verifyAdmin, verifyDevice } from '../middleware/auth.js';
import { mandarPush } from '../lib/push.js';
import { filaDeTarja, limpiarCuerpo } from '../lib/tarjaDesdeCuerpo.js';

export const MOTIVOS = {
  sin_internet: 'Sin internet',
  sin_luz: 'Sin luz',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Hoy en Argentina (el server corre en UTC: a las 21 hs ya seria "manana").
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmt = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const rango = (p) => (p.fecha_desde === p.fecha_hasta ? fmt(p.fecha_desde) : `${fmt(p.fecha_desde)} al ${fmt(p.fecha_hasta)}`);

// Lo mas viejo que se puede pedir: un mes y medio para atras.
const DIAS_MAXIMO_ATRAS = 45;

// ── Avisos ──────────────────────────────────────────────────────────────────

async function tokensVerificadores() {
  const r = await db.query(
    `SELECT pt.token FROM autorizantes a
     JOIN push_tokens pt ON pt.device_id = a.device_id
     WHERE a.rol = 'verificador' AND a.activo`
  );
  return r.rows.map((x) => x.token);
}

/** Al telefono que armo el pedido y a los demas del sector. */
async function tokensEncargado(pedido) {
  const r = await db.query(
    'SELECT token FROM push_tokens WHERE device_id = $1 OR sector_id = $2',
    [pedido.device_id, pedido.sector_id]
  );
  return r.rows.map((x) => x.token);
}

async function avisar(tokens, titulo, cuerpo, data) {
  try {
    await mandarPush(tokens, { titulo, cuerpo, data });
  } catch {
    // Sin notificaciones configuradas el pedido sigue igual: el aviso es extra.
  }
}

// ── Sesion de autorizante (Facundo, desde StaffAxis) ─────────────────────────

async function verifyAutorizante(req, reply) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No autorizado' });
  let p;
  try {
    p = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return reply.status(401).send({ error: 'Sesión vencida' });
  }
  if (p.tipo !== 'autorizante') return reply.status(401).send({ error: 'Este token no es de autorizante' });
  const r = await db.query('SELECT id, nombre, rol, activo FROM autorizantes WHERE id = $1', [p.autorizanteId]);
  if (!r.rows[0]?.activo) return reply.status(403).send({ error: 'Ya no tenés acceso como autorizante', revoked: true });
  req.autorizante = { ...r.rows[0], deviceId: p.deviceId };
}

// ── RRHH (Karina / Carolina, desde StaffAdmin) ──────────────────────────────

/**
 * Ademas del admin token comun, StaffAdmin manda x-admin-usuario: el token
 * personal que da el login con Google (lleva el mail). Sin eso no se sabe quien
 * es, y autorizar solo lo puede hacer RRHH.
 */
async function verifyRrhh(req, reply) {
  const t = req.headers['x-admin-usuario'];
  if (!t) return reply.status(403).send({ error: 'Entrá a StaffAdmin con tu cuenta de Google para autorizar' });
  let p;
  try {
    p = jwt.verify(String(t), process.env.JWT_SECRET);
  } catch {
    return reply.status(403).send({ error: 'Tu sesión venció: salí y volvé a entrar con Google' });
  }
  if (p.tipo !== 'admin_usuario' || !p.email) return reply.status(403).send({ error: 'Sesión inválida' });
  const r = await db.query(
    `SELECT id, nombre FROM autorizantes WHERE rol = 'rrhh' AND activo AND lower(email) = lower($1)`,
    [p.email]
  );
  if (!r.rows[0]) return reply.status(403).send({ error: `${p.email} no puede autorizar tarjas fuera de término` });
  req.rrhh = { ...r.rows[0], email: p.email };
}

// ── Lecturas comunes ────────────────────────────────────────────────────────

const SELECT_PEDIDO = `
  SELECT p.*, s.name AS sector_name,
         (SELECT COUNT(*)::int FROM fuera_termino_items i WHERE i.pedido_id = p.id) AS items,
         (SELECT COALESCE(SUM(i.horas), 0)::float FROM fuera_termino_items i WHERE i.pedido_id = p.id) AS horas
  FROM fuera_termino p JOIN sectors s ON s.id = p.sector_id`;

function pedidoDto(p) {
  return {
    id: p.id,
    sectorId: p.sector_id,
    sector: p.sector_name,
    encargado: p.encargado,
    motivo: p.motivo,
    motivoTexto: MOTIVOS[p.motivo] ?? p.motivo,
    fechaDesde: iso(p.fecha_desde),
    fechaHasta: iso(p.fecha_hasta),
    estado: p.estado,
    items: p.items,
    horas: p.horas,
    creadoEn: p.creado_en,
    enviadoEn: p.enviado_en,
    verificadoPor: p.verificado_por,
    verificadoEn: p.verificado_en,
    rrhhPor: p.rrhh_por,
    rrhhEn: p.rrhh_en,
    motivoRechazo: p.motivo_rechazo,
    resultado: p.resultado,
  };
}

async function itemsDe(pedidoId) {
  const r = await db.query(
    `SELECT i.id, i.employee_id, i.date, i.horas, i.cuerpo, e.first_name, e.last_name, e.dni
     FROM fuera_termino_items i JOIN employees e ON e.id = i.employee_id
     WHERE i.pedido_id = $1 ORDER BY i.date, e.last_name, e.first_name`,
    [pedidoId]
  );
  return r.rows.map((x) => ({
    id: x.id,
    employeeId: x.employee_id,
    empleado: `${x.last_name} ${x.first_name}`.trim(),
    dni: x.dni,
    date: iso(x.date),
    horas: x.horas,
    minutesWorked: x.cuerpo?.minutes_worked ?? null,
    notes: x.cuerpo?.notes ?? null,
    cuerpo: x.cuerpo,
  }));
}

async function pedidoPorId(id) {
  const r = await db.query(`${SELECT_PEDIDO} WHERE p.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function fueraTerminoRoutes(app) {

  // ════════════════ Encargado (StaffAxis) ════════════════

  // GET /api/fuera-termino — los pedidos del sector (los ultimos 60 dias)
  app.get('/api/fuera-termino', { preHandler: verifyDevice }, async (req, reply) => {
    const r = await db.query(
      `${SELECT_PEDIDO}
       WHERE p.sector_id = $1 AND p.estado <> 'descartado' AND p.creado_en > NOW() - INTERVAL '60 days'
       ORDER BY p.creado_en DESC`,
      [req.device.sectorId]
    );
    return reply.send({ motivos: MOTIVOS, pedidos: r.rows.map(pedidoDto) });
  });

  // POST /api/fuera-termino   body: { motivo, fecha_desde, fecha_hasta }
  app.post('/api/fuera-termino', { preHandler: verifyDevice }, async (req, reply) => {
    const { motivo, fecha_desde, fecha_hasta } = req.body ?? {};
    if (!MOTIVOS[motivo]) return reply.status(400).send({ error: 'Elegí el motivo' });
    if (!ISO.test(fecha_desde ?? '') || !ISO.test(fecha_hasta ?? '')) return reply.status(400).send({ error: 'Elegí las fechas' });
    if (fecha_desde > fecha_hasta) return reply.status(400).send({ error: 'La fecha "desde" no puede ser después de "hasta"' });
    const hoy = hoyAR();
    if (fecha_hasta >= hoy) return reply.status(400).send({ error: 'Hoy se carga por la tarja normal' });
    if (fecha_desde < sumarDias(hoy, -DIAS_MAXIMO_ATRAS)) {
      return reply.status(400).send({ error: `No se puede pedir más de ${DIAS_MAXIMO_ATRAS} días para atrás` });
    }
    const id = uuid();
    await db.query(
      `INSERT INTO fuera_termino (id, sector_id, device_id, encargado, motivo, fecha_desde, fecha_hasta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, req.device.sectorId, req.device.deviceId, req.device.encargadoName ?? null, motivo, fecha_desde, fecha_hasta]
    );
    return reply.send({ pedido: pedidoDto(await pedidoPorId(id)) });
  });

  // Solo el sector dueño, y solo mientras sea borrador, puede tocar las horas.
  async function borradorPropio(req, reply) {
    const p = await pedidoPorId(req.params.id);
    if (!p || p.sector_id !== req.device.sectorId) {
      reply.status(404).send({ error: 'Pedido no encontrado' });
      return null;
    }
    if (p.estado !== 'borrador') {
      reply.status(409).send({ error: 'Este pedido ya se mandó: no se puede cambiar' });
      return null;
    }
    return p;
  }

  // GET /api/fuera-termino/:id
  app.get('/api/fuera-termino/:id', { preHandler: verifyDevice }, async (req, reply) => {
    const p = await pedidoPorId(req.params.id);
    if (!p || p.sector_id !== req.device.sectorId) return reply.status(404).send({ error: 'Pedido no encontrado' });
    return reply.send({ pedido: pedidoDto(p), items: await itemsDe(p.id) });
  });

  // POST /api/fuera-termino/:id/items   body: el mismo de POST /api/submissions
  app.post('/api/fuera-termino/:id/items', { preHandler: verifyDevice }, async (req, reply) => {
    const p = await borradorPropio(req, reply);
    if (!p) return;
    const { employee_id, date } = req.body ?? {};
    if (!employee_id || !ISO.test(date ?? '')) return reply.status(400).send({ error: 'Faltan el empleado o la fecha' });
    const fd = iso(p.fecha_desde);
    const fh = iso(p.fecha_hasta);
    if (date < fd || date > fh) return reply.status(400).send({ error: 'Esa fecha no está dentro del pedido' });
    const emp = await db.query('SELECT sector_id FROM employees WHERE id = $1', [employee_id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    const cuerpo = limpiarCuerpo(req.body);
    const { cols, vals } = filaDeTarja(cuerpo);
    const horas = vals[cols.indexOf('horas')];
    await db.query(
      `INSERT INTO fuera_termino_items (id, pedido_id, employee_id, date, horas, cuerpo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (pedido_id, employee_id, date)
       DO UPDATE SET horas = EXCLUDED.horas, cuerpo = EXCLUDED.cuerpo, actualizado_en = NOW()`,
      [uuid(), p.id, employee_id, date, horas ?? null, cuerpo]
    );
    return reply.send({ ok: true });
  });

  // DELETE /api/fuera-termino/:id/items/:itemId
  app.delete('/api/fuera-termino/:id/items/:itemId', { preHandler: verifyDevice }, async (req, reply) => {
    const p = await borradorPropio(req, reply);
    if (!p) return;
    await db.query('DELETE FROM fuera_termino_items WHERE id = $1 AND pedido_id = $2', [req.params.itemId, p.id]);
    return reply.send({ ok: true });
  });

  // POST /api/fuera-termino/:id/descartar — el encargado se arrepiente del borrador
  app.post('/api/fuera-termino/:id/descartar', { preHandler: verifyDevice }, async (req, reply) => {
    const p = await borradorPropio(req, reply);
    if (!p) return;
    await db.query(`UPDATE fuera_termino SET estado = 'descartado' WHERE id = $1`, [p.id]);
    return reply.send({ ok: true });
  });

  // POST /api/fuera-termino/:id/enviar
  app.post('/api/fuera-termino/:id/enviar', { preHandler: verifyDevice }, async (req, reply) => {
    const p = await borradorPropio(req, reply);
    if (!p) return;
    if (!p.items) return reply.status(400).send({ error: 'Cargá las horas de al menos un empleado antes de mandar' });
    await db.query(`UPDATE fuera_termino SET estado = 'esperando_verificacion', enviado_en = NOW() WHERE id = $1`, [p.id]);
    await avisar(
      await tokensVerificadores(),
      `Tarja fuera de término: ${MOTIVOS[p.motivo]}`,
      `${p.sector_name} pide cargar ${p.items} tarja${p.items === 1 ? '' : 's'} del ${rango({ fecha_desde: iso(p.fecha_desde), fecha_hasta: iso(p.fecha_hasta) })}. Confirmá si hubo corte.`,
      { tipo: 'fuera_termino', pedido: p.id }
    );
    return reply.send({ ok: true });
  });

  // ════════════════ Verificador de cortes (Facundo, StaffAxis) ════════════════

  // POST /api/autorizante/entrar   body: { device_id }
  // El telefono tiene que estar cargado en `autorizantes` (lo carga Gaston).
  app.post('/api/autorizante/entrar', async (req, reply) => {
    const deviceId = String(req.body?.device_id ?? '').trim();
    if (!deviceId) return reply.status(400).send({ error: 'Falta el teléfono' });
    const r = await db.query(
      `SELECT id, nombre, rol FROM autorizantes WHERE device_id = $1 AND activo AND rol = 'verificador'`,
      [deviceId]
    );
    if (!r.rows[0]) {
      return reply.status(403).send({ error: 'Este teléfono no está habilitado para autorizar. Pedile a Sistemas que lo habilite.' });
    }
    const a = r.rows[0];
    const token = jwt.sign({ tipo: 'autorizante', autorizanteId: a.id, deviceId }, process.env.JWT_SECRET, { expiresIn: '365d' });
    return reply.send({ token, nombre: a.nombre, rol: a.rol });
  });

  // GET /api/autorizante/habilitado?device_id= — para mostrar el boton de entrada
  app.get('/api/autorizante/habilitado', async (req, reply) => {
    const deviceId = String(req.query?.device_id ?? '').trim();
    if (!deviceId) return reply.send({ habilitado: false });
    const r = await db.query(
      `SELECT 1 FROM autorizantes WHERE device_id = $1 AND activo AND rol = 'verificador'`,
      [deviceId]
    );
    return reply.send({ habilitado: !!r.rows[0] });
  });

  // GET /api/autorizante/pedidos — lo que espera su confirmacion, y lo ultimo que resolvio
  app.get('/api/autorizante/pedidos', { preHandler: verifyAutorizante }, async (req, reply) => {
    const pend = await db.query(`${SELECT_PEDIDO} WHERE p.estado = 'esperando_verificacion' ORDER BY p.enviado_en`);
    const hechos = await db.query(
      `${SELECT_PEDIDO} WHERE p.verificado_en IS NOT NULL AND p.verificado_en > NOW() - INTERVAL '15 days'
       ORDER BY p.verificado_en DESC LIMIT 30`
    );
    const pendientes = [];
    for (const p of pend.rows) pendientes.push({ ...pedidoDto(p), detalle: await itemsDe(p.id) });
    return reply.send({ nombre: req.autorizante.nombre, pendientes, resueltos: hechos.rows.map(pedidoDto) });
  });

  // POST /api/autorizante/pedidos/:id/confirmar — hubo corte: pasa a RRHH
  app.post('/api/autorizante/pedidos/:id/confirmar', { preHandler: verifyAutorizante }, async (req, reply) => {
    const r = await db.query(
      `UPDATE fuera_termino SET estado = 'esperando_rrhh', verificado_por = $2, verificado_en = NOW()
       WHERE id = $1 AND estado = 'esperando_verificacion' RETURNING id`,
      [req.params.id, req.autorizante.nombre]
    );
    if (!r.rowCount) return reply.status(409).send({ error: 'Ese pedido ya no está esperando confirmación' });
    return reply.send({ ok: true });
  });

  // POST /api/autorizante/pedidos/:id/rechazar   body: { motivo }
  app.post('/api/autorizante/pedidos/:id/rechazar', { preHandler: verifyAutorizante }, async (req, reply) => {
    const motivo = String(req.body?.motivo ?? '').trim() || 'No se confirmó el corte';
    const r = await db.query(
      `UPDATE fuera_termino SET estado = 'no_autorizada', verificado_por = $2, verificado_en = NOW(), motivo_rechazo = $3
       WHERE id = $1 AND estado = 'esperando_verificacion' RETURNING id`,
      [req.params.id, req.autorizante.nombre, motivo]
    );
    if (!r.rowCount) return reply.status(409).send({ error: 'Ese pedido ya no está esperando confirmación' });
    const p = await pedidoPorId(req.params.id);
    await avisar(
      await tokensEncargado(p),
      'Tarja fuera de término no aprobada',
      `${MOTIVOS[p.motivo]} (${rango({ fecha_desde: iso(p.fecha_desde), fecha_hasta: iso(p.fecha_hasta) })}): ${motivo}`,
      { tipo: 'fuera_termino', pedido: p.id }
    );
    return reply.send({ ok: true });
  });

  // ════════════════ RRHH (StaffAdmin) ════════════════

  // GET /api/admin/fuera-termino?estado=esperando_rrhh|todos
  // Lo puede mirar cualquiera de StaffAdmin; autorizar, solo RRHH.
  app.get('/api/admin/fuera-termino', { preHandler: verifyAdmin }, async (req, reply) => {
    const estado = req.query?.estado ?? 'esperando_rrhh';
    const r = estado === 'todos'
      ? await db.query(`${SELECT_PEDIDO} WHERE p.estado <> 'descartado' AND p.estado <> 'borrador' ORDER BY p.enviado_en DESC NULLS LAST LIMIT 200`)
      : await db.query(`${SELECT_PEDIDO} WHERE p.estado = $1 ORDER BY p.enviado_en`, [estado]);
    const pedidos = [];
    for (const p of r.rows) pedidos.push({ ...pedidoDto(p), detalle: await itemsDe(p.id) });
    return reply.send({ pedidos });
  });

  // GET /api/admin/fuera-termino/contador — para el aviso en vivo de StaffAdmin
  app.get('/api/admin/fuera-termino/contador', { preHandler: verifyAdmin }, async (_req, reply) => {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n, MAX(verificado_en) AS ultimo FROM fuera_termino WHERE estado = 'esperando_rrhh'`
    );
    return reply.send({ esperando: r.rows[0].n, ultimo: r.rows[0].ultimo });
  });

  // GET /api/admin/fuera-termino/puedo-autorizar — si el usuario logueado es de RRHH
  app.get('/api/admin/fuera-termino/puedo-autorizar', { preHandler: verifyAdmin }, async (req, reply) => {
    let puede = false;
    let motivo = null;
    await verifyRrhh(req, { status: () => ({ send: (b) => { motivo = b?.error; } }) });
    if (req.rrhh) puede = true;
    return reply.send({ puede, motivo, nombre: req.rrhh?.nombre ?? null });
  });

  // POST /api/admin/fuera-termino/:id/autorizar — OK final: se cargan las tarjas
  app.post('/api/admin/fuera-termino/:id/autorizar', { preHandler: [verifyAdmin, verifyRrhh] }, async (req, reply) => {
    const cliente = await db.connect();
    let resultado;
    let p;
    try {
      await cliente.query('BEGIN');
      const lock = await cliente.query(
        `SELECT * FROM fuera_termino WHERE id = $1 FOR UPDATE`, [req.params.id]
      );
      p = lock.rows[0];
      if (!p || p.estado !== 'esperando_rrhh') {
        await cliente.query('ROLLBACK');
        return reply.status(409).send({ error: 'Ese pedido ya no está esperando autorización' });
      }
      const items = await cliente.query(
        `SELECT i.employee_id, i.date, i.cuerpo, e.first_name, e.last_name
         FROM fuera_termino_items i JOIN employees e ON e.id = i.employee_id WHERE i.pedido_id = $1`,
        [p.id]
      );
      const cargadas = [];
      const salteadas = [];
      for (const it of items.rows) {
        const { cols, vals } = filaDeTarja(it.cuerpo ?? {});
        const base = ['id', 'employee_id', 'sector_id', 'date', 'status', 'fuera_termino_id'];
        const todos = [...base, ...cols];
        const valores = [uuid(), it.employee_id, p.sector_id, iso(it.date), 'approved', p.id, ...vals];
        // DO NOTHING: si ese dia ya tiene una tarja viva (cargada por otro lado
        // mientras tanto) no se pisa, se avisa en el resultado.
        const ins = await cliente.query(
          `INSERT INTO submissions (${todos.join(', ')})
           VALUES (${todos.map((_, i) => '$' + (i + 1)).join(', ')})
           ON CONFLICT (employee_id, date) WHERE NOT is_deleted DO NOTHING
           RETURNING id`,
          valores
        );
        const quien = { empleado: `${it.last_name} ${it.first_name}`.trim(), date: iso(it.date) };
        if (ins.rowCount) cargadas.push(quien);
        else salteadas.push(quien);
      }
      resultado = { cargadas: cargadas.length, salteadas };
      await cliente.query(
        `UPDATE fuera_termino SET estado = 'autorizada', rrhh_por = $2, rrhh_en = NOW(), resultado = $3 WHERE id = $1`,
        [p.id, req.rrhh.nombre, resultado]
      );
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      req.log.error(err, 'fuera-termino autorizar');
      return reply.status(500).send({ error: 'No se pudo autorizar: ' + err.message });
    } finally {
      cliente.release();
    }
    const completo = await pedidoPorId(p.id);
    await avisar(
      await tokensEncargado(completo),
      'Tarja fuera de término autorizada',
      `${MOTIVOS[completo.motivo]} (${rango({ fecha_desde: iso(completo.fecha_desde), fecha_hasta: iso(completo.fecha_hasta) })}): ya quedaron cargadas ${resultado.cargadas} tarja${resultado.cargadas === 1 ? '' : 's'}.`,
      { tipo: 'fuera_termino', pedido: p.id }
    );
    return reply.send({ ok: true, ...resultado });
  });

  // POST /api/admin/fuera-termino/:id/rechazar   body: { motivo }
  app.post('/api/admin/fuera-termino/:id/rechazar', { preHandler: [verifyAdmin, verifyRrhh] }, async (req, reply) => {
    const motivo = String(req.body?.motivo ?? '').trim() || 'No autorizada por RRHH';
    const r = await db.query(
      `UPDATE fuera_termino SET estado = 'no_autorizada', rrhh_por = $2, rrhh_en = NOW(), motivo_rechazo = $3
       WHERE id = $1 AND estado = 'esperando_rrhh' RETURNING id`,
      [req.params.id, req.rrhh.nombre, motivo]
    );
    if (!r.rowCount) return reply.status(409).send({ error: 'Ese pedido ya no está esperando autorización' });
    const p = await pedidoPorId(req.params.id);
    await avisar(
      await tokensEncargado(p),
      'Tarja fuera de término no aprobada',
      `${MOTIVOS[p.motivo]} (${rango({ fecha_desde: iso(p.fecha_desde), fecha_hasta: iso(p.fecha_hasta) })}): ${motivo}`,
      { tipo: 'fuera_termino', pedido: p.id }
    );
    return reply.send({ ok: true });
  });
}

/** Las DATE de pg llegan como Date a medianoche local; se pasan a yyyy-mm-dd. */
function iso(d) {
  if (!d) return d;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
