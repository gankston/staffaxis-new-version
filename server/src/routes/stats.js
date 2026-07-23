import { db } from '../db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function horas(minutos) {
  return Math.round(Number(minutos ?? 0) / 60 * 10) / 10;
}

const CAST_MW = `CAST(NULLIF(REPLACE(REGEXP_REPLACE(NULLIF(sub.minutes_worked,'C'), '[^0-9.,]', '', 'g'), ',', '.'), '') AS NUMERIC)`;
const COUNT_COSECHA = `COUNT(sub.id) FILTER (WHERE sub.minutes_worked = 'C')`;

function resolvePeriod(periodo, fecha_desde, fecha_hasta) {
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  if (fecha_desde && fecha_hasta) return { desde: fecha_desde, hasta: fecha_hasta };
  switch (periodo) {
    case 'hoy':    return { desde: hoyStr, hasta: hoyStr };
    case 'ayer': { const a = new Date(hoy - 864e5).toISOString().slice(0,10); return { desde: a, hasta: a }; }
    case 'semana_actual': {
      const d = hoy.getDay() || 7;
      return { desde: new Date(hoy - (d-1)*864e5).toISOString().slice(0,10), hasta: hoyStr };
    }
    case 'semana_anterior': {
      const d = hoy.getDay() || 7;
      const lunEsta = new Date(hoy - (d-1)*864e5);
      const lunAnt  = new Date(lunEsta - 7*864e5);
      const domAnt  = new Date(lunEsta - 864e5);
      return { desde: lunAnt.toISOString().slice(0,10), hasta: domAnt.toISOString().slice(0,10) };
    }
    case 'mes_actual':
      return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`, hasta: hoyStr };
    case 'mes_anterior': {
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      const ini = new Date(fin.getFullYear(), fin.getMonth(), 1);
      return { desde: ini.toISOString().slice(0,10), hasta: fin.toISOString().slice(0,10) };
    }
    case 'ultimos_7_dias':  return { desde: new Date(hoy-7*864e5).toISOString().slice(0,10), hasta: hoyStr };
    case 'ultimos_30_dias': return { desde: new Date(hoy-30*864e5).toISOString().slice(0,10), hasta: hoyStr };
    case 'ultimos_90_dias': return { desde: new Date(hoy-90*864e5).toISOString().slice(0,10), hasta: hoyStr };
    default: return {
      desde: fecha_desde ?? new Date(hoy-30*864e5).toISOString().slice(0,10),
      hasta: fecha_hasta ?? hoyStr,
    };
  }
}

function valRow(val, cosecha) {
  const obj = {};
  if (+cosecha > 0) obj.dias_cosecha = +cosecha;
  const v = +(+val ?? 0);
  if (v > 0) { obj.horas_totales = horas(v); obj.importe_total = +v.toFixed(2); }
  return obj;
}

// ── Cache en memoria con TTL ──────────────────────────────────────────────────
const cache = new Map();
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
function cached(ttlMs, fn) {
  return async (req, reply) => {
    const key = req.url;
    const hit = cacheGet(key);
    if (hit) return reply.send(hit);
    const data = await fn(req, reply);
    if (data !== undefined) cacheSet(key, data, ttlMs);
    return reply.send(data);
  };
}

const TTL_LARGO   = 5 * 60 * 1000;   // 5 min — datos históricos
const TTL_MEDIO   = 2 * 60 * 1000;   // 2 min — datos del día
const TTL_ESTATICO = 60 * 60 * 1000; // 1 hora — metadata sin queries

// ── Auth ──────────────────────────────────────────────────────────────────────
function verifyAdmin(req, reply, done) {
  if (req.headers['x-admin-token'] !== 'staffaxis_admin_token_2024_prod') {
    return reply.status(401).send({ error: 'Token inválido' });
  }
  done();
}

// ── Registro de rutas ─────────────────────────────────────────────────────────
export async function statsRoutes(app) {

  // GET /api/stats/resumen-general
  app.get('/api/stats/resumen-general', { preHandler: verifyAdmin }, cached(TTL_MEDIO, async () => {
    const r = await db.query(`
      SELECT
        (SELECT COUNT(*) FILTER (WHERE is_active)     FROM employees) AS activos,
        (SELECT COUNT(*) FILTER (WHERE NOT is_active) FROM employees) AS inactivos,
        (SELECT COUNT(*)                              FROM sectors)   AS sectores,
        (SELECT COUNT(*) FROM submissions WHERE date >= CURRENT_DATE - 30 AND NOT is_deleted)                   AS registros,
        (SELECT COUNT(DISTINCT sector_id)   FROM submissions WHERE date >= CURRENT_DATE - 30 AND NOT is_deleted) AS sectores_activos,
        (SELECT COUNT(DISTINCT employee_id) FROM submissions WHERE date >= CURRENT_DATE - 30 AND NOT is_deleted) AS empleados_activos,
        (SELECT COUNT(*) FROM absences WHERE start_date >= CURRENT_DATE - 30)                                    AS abs_total,
        (SELECT COUNT(*) FILTER (WHERE is_justified) FROM absences WHERE start_date >= CURRENT_DATE - 30)       AS abs_justificadas
    `);
    const row = r.rows[0];
    return {
      empleados: { activos: +row.activos, inactivos: +row.inactivos },
      sectores: { total: +row.sectores },
      ultimos_30_dias: {
        registros_de_trabajo: +row.registros,
        sectores_con_actividad: +row.sectores_activos,
        empleados_con_registro: +row.empleados_activos,
        ausencias: +row.abs_total,
        ausencias_con_certificado: +row.abs_justificadas,
      },
    };
  }));

  // GET /api/stats/empleados?sector=&activos=&busqueda=
  app.get('/api/stats/empleados', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, activos, busqueda } = req.query;
    const conds = [], params = [];
    let i = 1;
    if (activos !== undefined) { conds.push(`e.is_active = $${i++}`); params.push(activos === 'true'); }
    if (sector)   { conds.push(`s.name ILIKE $${i++}`); params.push(`%${sector}%`); }
    if (busqueda) {
      conds.push(`(e.first_name ILIKE $${i} OR e.last_name ILIKE $${i} OR e.dni ILIKE $${i} OR (e.first_name||' '||e.last_name) ILIKE $${i})`);
      params.push(`%${busqueda}%`); i++;
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await db.query(`
      SELECT e.first_name AS nombre, e.last_name AS apellido, e.dni,
             e.is_active AS activo, s.name AS sector
      FROM employees e JOIN sectors s ON s.id = e.sector_id
      ${where}
      ORDER BY s.name, e.last_name, e.first_name LIMIT 300
    `, params);
    return { total: r.rows.length, empleados: r.rows };
  }));

  // GET /api/stats/empleados-incompletos?sector=
  app.get('/api/stats/empleados-incompletos', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector } = req.query;
    const params = [];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $1`) : '';
    const r = await db.query(`
      SELECT e.id, e.first_name AS nombre, e.last_name AS apellido, e.dni,
             e.dni_foto_frente, e.dni_foto_dorso,
             s.name AS sector,
             (e.dni IS NULL OR e.dni = '')                AS sin_dni,
             (e.dni_foto_frente IS NULL)                  AS sin_foto_frente,
             (e.dni_foto_dorso  IS NULL)                  AS sin_foto_dorso
      FROM employees e JOIN sectors s ON s.id = e.sector_id
      WHERE e.is_active = true
        AND (e.dni IS NULL OR e.dni = '' OR e.dni_foto_frente IS NULL OR e.dni_foto_dorso IS NULL)
        ${cond}
      ORDER BY s.name, e.last_name, e.first_name
    `, params);
    const total = r.rows.length;
    const sin_dni = r.rows.filter(x => x.sin_dni).length;
    const sin_foto_frente = r.rows.filter(x => x.sin_foto_frente).length;
    const sin_foto_dorso  = r.rows.filter(x => x.sin_foto_dorso).length;
    return {
      resumen: { total_incompletos: total, sin_dni, sin_foto_frente, sin_foto_dorso },
      empleados: r.rows.map(x => ({
        id: x.id, nombre: x.nombre, apellido: x.apellido, dni: x.dni,
        sector: x.sector, sin_dni: x.sin_dni, sin_foto_frente: x.sin_foto_frente, sin_foto_dorso: x.sin_foto_dorso,
      })),
    };
  }));

  // GET /api/stats/actividad-por-sector?sector=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/actividad-por-sector', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, fecha_desde, fecha_hasta } = req.query;
    const desde = fecha_desde ?? new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const hasta = fecha_hasta ?? new Date().toISOString().slice(0,10);
    const params = [desde, hasta];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $3`) : '';
    const r = await db.query(`
      SELECT s.name AS sector, s.tipo_carga, s.encargado,
        COUNT(DISTINCT sub.employee_id) AS empleados,
        COUNT(DISTINCT sub.date)        AS dias_activos,
        COUNT(sub.id)                   AS total_registros,
        ${COUNT_COSECHA}                AS dias_cosecha,
        SUM(${CAST_MW})                 AS total_valor
      FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
      WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
      GROUP BY s.id, s.name, s.tipo_carga, s.encargado
      ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC
    `, params);
    return {
      periodo: { desde, hasta },
      sectores: r.rows.map(row => {
        const obj = { sector: row.sector, encargado: row.encargado, empleados_con_registro: +row.empleados, dias_activos: +row.dias_activos, total_registros: +row.total_registros };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
        return obj;
      }),
    };
  }));

  // GET /api/stats/ausencias?sector=&fecha_desde=&fecha_hasta=&con_certificado=
  app.get('/api/stats/ausencias', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, fecha_desde, fecha_hasta, con_certificado } = req.query;
    const desde = fecha_desde ?? new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const hasta = fecha_hasta ?? new Date().toISOString().slice(0,10);
    const conds = [`a.start_date <= $2 AND a.end_date >= $1`];
    const params = [desde, hasta];
    let i = 3;
    if (sector)          { conds.push(`s.name ILIKE $${i++}`); params.push(`%${sector}%`); }
    if (con_certificado !== undefined) { conds.push(`a.is_justified = $${i++}`); params.push(con_certificado === 'true'); }
    const r = await db.query(`
      SELECT e.first_name||' '||e.last_name AS empleado, e.dni,
             s.name AS sector, a.start_date, a.end_date,
             a.is_justified AS con_certificado, a.observations,
             (a.end_date - a.start_date + 1) AS dias
      FROM absences a
      JOIN employees e ON e.id = a.employee_id
      JOIN sectors s ON s.id = e.sector_id
      WHERE ${conds.join(' AND ')}
      ORDER BY a.start_date DESC, s.name LIMIT 500
    `, params);
    return {
      periodo: { desde, hasta },
      resumen: { total: r.rows.length, con_certificado: r.rows.filter(x=>x.con_certificado).length, sin_certificado: r.rows.filter(x=>!x.con_certificado).length },
      ausencias: r.rows,
    };
  }));

  // GET /api/stats/ranking-empleados?sector=&fecha_desde=&fecha_hasta=&top=
  app.get('/api/stats/ranking-empleados', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, fecha_desde, fecha_hasta, top = '20' } = req.query;
    const desde = fecha_desde ?? new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const hasta = fecha_hasta ?? new Date().toISOString().slice(0,10);
    const params = [desde, hasta, parseInt(top)];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $4`) : '';
    const r = await db.query(`
      SELECT e.first_name||' '||e.last_name AS empleado, e.dni, s.name AS sector,
             COUNT(sub.id)    AS dias_trabajados,
             ${COUNT_COSECHA} AS dias_cosecha,
             SUM(${CAST_MW})  AS total_valor
      FROM submissions sub
      JOIN employees e ON e.id = sub.employee_id
      JOIN sectors s ON s.id = sub.sector_id
      WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
      GROUP BY e.id, e.first_name, e.last_name, e.dni, s.name
      ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC
      LIMIT $3
    `, params);
    return {
      periodo: { desde, hasta },
      ranking: r.rows.map((row, i) => {
        const obj = { posicion: i+1, empleado: row.empleado, dni: row.dni, sector: row.sector, dias_trabajados: +row.dias_trabajados };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
        return obj;
      }),
    };
  }));

  // GET /api/stats/resumen-diario?fecha=
  app.get('/api/stats/resumen-diario', { preHandler: verifyAdmin }, cached(TTL_MEDIO, async (req) => {
    const dia = req.query.fecha ?? new Date().toISOString().slice(0,10);
    const r = await db.query(`
      SELECT
        s.name AS sector, s.encargado,
        COUNT(DISTINCT sub.employee_id) AS empleados,
        ${COUNT_COSECHA}                AS dias_cosecha,
        SUM(${CAST_MW})                 AS total_valor,
        (SELECT COUNT(*) FROM absences WHERE start_date <= $1 AND end_date >= $1)                          AS abs_total,
        (SELECT COUNT(*) FILTER (WHERE is_justified) FROM absences WHERE start_date <= $1 AND end_date >= $1) AS abs_cert
      FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
      WHERE sub.date = $1 AND NOT sub.is_deleted
      GROUP BY s.id, s.name, s.encargado ORDER BY s.name
    `, [dia]);
    const abs = r.rows[0] ? { total: +r.rows[0].abs_total, con_certificado: +r.rows[0].abs_cert } : { total: 0, con_certificado: 0 };
    return {
      fecha: dia,
      ausencias: abs,
      sectores_con_actividad: r.rows.length,
      actividad: r.rows.map(row => {
        const obj = { sector: row.sector, encargado: row.encargado, empleados_registrados: +row.empleados };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
        return obj;
      }),
    };
  }));

  // GET /api/stats/resumen-mensual?año=&mes=&sector=
  app.get('/api/stats/resumen-mensual', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const hoy = new Date();
    const y = parseInt(req.query.año ?? hoy.getFullYear());
    const m = parseInt(req.query.mes ?? (hoy.getMonth() + 1));
    const desde = `${y}-${String(m).padStart(2,'0')}-01`;
    const hasta = new Date(y, m, 0).toISOString().slice(0,10);
    const params = [desde, hasta];
    const cond = req.query.sector ? (params.push(`%${req.query.sector}%`), `AND s.name ILIKE $3`) : '';
    const [sectores, top10, abs] = await Promise.all([
      db.query(`
        SELECT s.name AS sector, s.encargado,
          COUNT(DISTINCT sub.date)        AS dias_activos,
          COUNT(DISTINCT sub.employee_id) AS empleados_unicos,
          COUNT(sub.id)                   AS registros,
          ${COUNT_COSECHA}                AS dias_cosecha,
          SUM(${CAST_MW})                 AS total_valor
        FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY s.id, s.name, s.encargado
        ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC
      `, params),
      db.query(`
        SELECT e.first_name||' '||e.last_name AS empleado, s.name AS sector,
          COUNT(sub.id)    AS dias,
          ${COUNT_COSECHA} AS dias_cosecha,
          SUM(${CAST_MW})  AS total_valor
        FROM submissions sub
        JOIN employees e ON e.id = sub.employee_id
        JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY e.id, e.first_name, e.last_name, s.name
        ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC LIMIT 10
      `, params),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_justified) AS con_certificado FROM absences WHERE start_date <= $2 AND end_date >= $1`, [desde, hasta]),
    ]);
    return {
      periodo: { año: y, mes: m, desde, hasta },
      ausencias: { total: +abs.rows[0].total, con_certificado: +abs.rows[0].con_certificado },
      sectores: sectores.rows.map(row => {
        const obj = { sector: row.sector, encargado: row.encargado, dias_activos: +row.dias_activos, empleados_unicos: +row.empleados_unicos, registros: +row.registros };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
        return obj;
      }),
      top_10_empleados: top10.rows.map((row, i) => {
        const obj = { posicion: i+1, empleado: row.empleado, sector: row.sector, dias: +row.dias };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
        return obj;
      }),
    };
  }));

  // GET /api/stats/historial-empleado?busqueda=
  app.get('/api/stats/historial-empleado', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { busqueda } = req.query;
    if (!busqueda) return { error: 'Parámetro busqueda requerido' };
    const r = await db.query(`
      WITH emp AS (
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
               e.is_active AS activo, e.created_at, s.name AS sector_actual
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1
        LIMIT 1
      )
      SELECT e.*,
        (SELECT json_agg(row_to_json(s) ORDER BY s.date DESC) FROM (
          SELECT sub.date, sub.minutes_worked, sub.notes FROM submissions sub
          WHERE sub.employee_id = e.id AND NOT sub.is_deleted ORDER BY sub.date DESC LIMIT 60
        ) s) AS ultimos_registros,
        (SELECT json_agg(row_to_json(a) ORDER BY a.start_date DESC) FROM (
          SELECT start_date, end_date, is_justified AS con_certificado, observations
          FROM absences WHERE employee_id = e.id ORDER BY start_date DESC LIMIT 20
        ) a) AS ausencias,
        (SELECT json_agg(row_to_json(t) ORDER BY t.transferred_at DESC) FROM (
          SELECT tr.transferred_at, s1.name AS de_sector, s2.name AS a_sector
          FROM transfers tr
          JOIN sectors s1 ON s1.id = tr.from_sector_id
          JOIN sectors s2 ON s2.id = tr.to_sector_id
          WHERE tr.employee_id = e.id ORDER BY tr.transferred_at DESC
        ) t) AS transferencias
      FROM emp e
    `, [`%${busqueda}%`]);
    if (!r.rows[0]) return { error: `No se encontró empleado con "${busqueda}"` };
    const e = r.rows[0];
    return {
      empleado: { nombre: e.nombre, dni: e.dni, activo: e.activo, sector_actual: e.sector_actual },
      ultimos_60_registros: e.ultimos_registros ?? [],
      ausencias: e.ausencias ?? [],
      transferencias: e.transferencias ?? [],
    };
  }));

  // GET /api/stats/comparativa-sectores?fecha_desde=&fecha_hasta=&tipo_carga=
  app.get('/api/stats/comparativa-sectores', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { fecha_desde, fecha_hasta, tipo_carga } = req.query;
    const desde = fecha_desde ?? new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const hasta = fecha_hasta ?? new Date().toISOString().slice(0,10);
    const params = [desde, hasta];
    const cond = tipo_carga ? (params.push(tipo_carga), `AND s.tipo_carga = $3`) : '';
    const r = await db.query(`
      SELECT s.name AS sector, s.encargado,
        COUNT(DISTINCT e.id) FILTER (WHERE e.is_active) AS empleados_activos,
        COUNT(DISTINCT sub.date)                         AS dias_activos,
        COUNT(DISTINCT sub.employee_id)                  AS empleados_con_registro,
        COUNT(sub.id)                                    AS total_registros,
        ${COUNT_COSECHA}                                 AS dias_cosecha,
        SUM(${CAST_MW})                                  AS total_valor,
        AVG(${CAST_MW})                                  AS promedio_por_registro
      FROM sectors s
      LEFT JOIN employees e ON e.sector_id = s.id
      LEFT JOIN submissions sub ON sub.sector_id = s.id
        AND sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted
      WHERE 1=1 ${cond}
      GROUP BY s.id, s.name, s.encargado
      ORDER BY COALESCE(SUM(${CAST_MW}), 0) + COALESCE(${COUNT_COSECHA}, 0) DESC
    `, params);
    return {
      periodo: { desde, hasta },
      sectores: r.rows.map(row => {
        const obj = { sector: row.sector, encargado: row.encargado, empleados_activos: +row.empleados_activos, dias_activos_en_periodo: +(row.dias_activos??0), empleados_con_registro: +(row.empleados_con_registro??0) };
        if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
        const val = +(+row.total_valor ?? 0);
        if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); obj.promedio_por_registro = +(+row.promedio_por_registro??0).toFixed(2); }
        return obj;
      }),
    };
  }));

  // GET /api/stats/comparativa-empleados-mensual?sector=
  app.get('/api/stats/comparativa-empleados-mensual', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const hoy = new Date();
    const inicioEsteMes    = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0,10);
    const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1).toISOString().slice(0,10);
    const finMesAnterior   = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0,10);
    const params = [inicioEsteMes, inicioMesAnterior, finMesAnterior];
    const cond = req.query.sector ? (params.push(`%${req.query.sector}%`), `AND s.name ILIKE $${params.length}`) : '';
    const r = await db.query(`
      SELECT s.name AS sector,
        COUNT(*) FILTER (WHERE e.is_active)                                               AS activos_hoy,
        COUNT(*) FILTER (WHERE e.created_at < $1 AND (e.is_active OR e.updated_at > $3)) AS activos_mes_anterior,
        COUNT(*) FILTER (WHERE e.created_at >= $1)                                        AS altas_este_mes,
        COUNT(*) FILTER (WHERE NOT e.is_active AND e.updated_at >= $1)                   AS bajas_este_mes,
        COUNT(*) FILTER (WHERE e.created_at BETWEEN $2 AND $3)                           AS altas_mes_anterior,
        COUNT(*) FILTER (WHERE NOT e.is_active AND e.updated_at BETWEEN $2 AND $3)       AS bajas_mes_anterior
      FROM employees e JOIN sectors s ON s.id = e.sector_id
      WHERE 1=1 ${cond}
      GROUP BY s.id, s.name HAVING COUNT(*) > 0 ORDER BY s.name
    `, params);
    const totales = r.rows.reduce((acc, row) => ({
      activos_hoy:           acc.activos_hoy           + +row.activos_hoy,
      activos_mes_anterior:  acc.activos_mes_anterior  + +row.activos_mes_anterior,
      altas_este_mes:        acc.altas_este_mes        + +row.altas_este_mes,
      bajas_este_mes:        acc.bajas_este_mes        + +row.bajas_este_mes,
      altas_mes_anterior:    acc.altas_mes_anterior    + +row.altas_mes_anterior,
      bajas_mes_anterior:    acc.bajas_mes_anterior    + +row.bajas_mes_anterior,
    }), { activos_hoy:0, activos_mes_anterior:0, altas_este_mes:0, bajas_este_mes:0, altas_mes_anterior:0, bajas_mes_anterior:0 });
    return {
      mes_anterior: new Date(hoy.getFullYear(), hoy.getMonth()-1, 1).toLocaleString('es-AR', { month:'long', year:'numeric' }),
      mes_actual:   hoy.toLocaleString('es-AR', { month:'long', year:'numeric' }),
      totales_generales: { activos_mes_anterior: totales.activos_mes_anterior, activos_este_mes: totales.activos_hoy, variacion: totales.activos_hoy - totales.activos_mes_anterior, altas_mes_anterior: totales.altas_mes_anterior, bajas_mes_anterior: totales.bajas_mes_anterior, altas_este_mes: totales.altas_este_mes, bajas_este_mes: totales.bajas_este_mes },
      por_sector: r.rows.map(row => ({ sector: row.sector, mes_anterior: { activos: +row.activos_mes_anterior, altas: +row.altas_mes_anterior, bajas: +row.bajas_mes_anterior }, este_mes: { activos: +row.activos_hoy, altas: +row.altas_este_mes, bajas: +row.bajas_este_mes }, variacion: +row.activos_hoy - +row.activos_mes_anterior })),
    };
  }));

  // GET /api/stats/detalle-empleado-periodo?busqueda=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/detalle-empleado-periodo', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { busqueda, periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!busqueda) return { error: 'Parámetro busqueda requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const emp = await db.query(`
      SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
             e.is_active AS activo, e.created_at, s.id AS sector_id, s.name AS sector, s.encargado
      FROM employees e JOIN sectors s ON s.id = e.sector_id
      WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
        OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
    `, [`%${busqueda}%`]);
    if (!emp.rows[0]) return { error: `No se encontró empleado con "${busqueda}"` };
    const e = emp.rows[0];
    const [dias, abs] = await Promise.all([
      db.query(`
        SELECT sub.date, sub.minutes_worked, sub.notes,
               CAST(NULLIF(REPLACE(REGEXP_REPLACE(NULLIF(sub.minutes_worked,'C'), '[^0-9.,]', '', 'g'), ',', '.'), '') AS NUMERIC) AS valor
        FROM submissions sub
        WHERE sub.employee_id = $1 AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
        ORDER BY sub.date
      `, [e.id, desde, hasta]),
      db.query(`
        SELECT start_date, end_date, is_justified AS con_certificado, observations, (end_date - start_date + 1) AS dias
        FROM absences WHERE employee_id = $1 AND start_date <= $3 AND end_date >= $2
      `, [e.id, desde, hasta]),
    ]);
    const diasCosecha  = dias.rows.filter(r => r.minutes_worked === 'C').length;
    const totalValor   = dias.rows.reduce((s,r) => s + (+r.valor||0), 0);
    return {
      summary: { empleado_id: e.id, nombre: e.nombre, dni: e.dni, sector: e.sector, encargado: e.encargado, activo: e.activo, dias_trabajados: dias.rows.length, dias_cosecha: diasCosecha, ...(totalValor > 0 ? { horas_totales: horas(totalValor), importe_total: +totalValor.toFixed(2) } : {}), ausencias_en_periodo: abs.rows.reduce((s,r) => s + +r.dias, 0) },
      rows: dias.rows.map(r => ({ fecha: r.date, minutes_worked: r.minutes_worked, valor: r.valor ? +r.valor : null, horas: r.valor ? horas(r.valor) : null, notas: r.notes || null })),
      ausencias: abs.rows,
      metadata: { periodo: { desde, hasta }, empleado_id: e.id },
    };
  }));

  // GET /api/stats/detalle-sector-periodo?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/detalle-sector-periodo', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!sector) return { error: 'Parámetro sector requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const sec = await db.query(`SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1`, [`%${sector}%`]);
    if (!sec.rows[0]) return { error: `Sector "${sector}" no encontrado` };
    const s = sec.rows[0];
    const r = await db.query(`
      SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni, e.is_active AS activo,
             COUNT(sub.id)    AS dias_trabajados,
             ${COUNT_COSECHA} AS dias_cosecha,
             SUM(${CAST_MW})  AS total_valor
      FROM employees e
      LEFT JOIN submissions sub ON sub.employee_id = e.id
        AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
      WHERE e.sector_id = $1
      GROUP BY e.id, e.first_name, e.last_name, e.dni, e.is_active
      ORDER BY COALESCE(SUM(${CAST_MW}),0) + COALESCE(${COUNT_COSECHA},0) DESC
    `, [s.id, desde, hasta]);
    const totalValor = r.rows.reduce((a,x) => a + (+x.total_valor||0), 0);
    return {
      summary: { sector_id: s.id, sector: s.name, encargado: s.encargado, total_empleados: r.rows.length, empleados_activos: r.rows.filter(x=>x.activo).length, empleados_con_actividad: r.rows.filter(x=>+x.dias_trabajados>0).length, total_dias_trabajados: r.rows.reduce((a,x)=>a+ +x.dias_trabajados,0), total_dias_cosecha: r.rows.reduce((a,x)=>a+ +x.dias_cosecha,0), ...(totalValor > 0 ? { horas_totales: horas(totalValor), importe_total: +totalValor.toFixed(2) } : {}) },
      rows: r.rows.map(x => ({ empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, activo: x.activo, dias_trabajados: +x.dias_trabajados, ...valRow(x.total_valor, x.dias_cosecha) })),
      metadata: { periodo: { desde, hasta }, sector_id: s.id },
    };
  }));

  // GET /api/stats/serie-temporal-empleado?busqueda=&agrupacion=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/serie-temporal-empleado', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { busqueda, agrupacion = 'diario', periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!busqueda) return { error: 'Parámetro busqueda requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const emp = await db.query(`
      SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni, s.name AS sector
      FROM employees e JOIN sectors s ON s.id = e.sector_id
      WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
        OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
    `, [`%${busqueda}%`]);
    if (!emp.rows[0]) return { error: `No se encontró empleado con "${busqueda}"` };
    const e = emp.rows[0];
    const trunc = agrupacion === 'mensual' ? 'month' : agrupacion === 'semanal' ? 'week' : 'day';
    const r = await db.query(`
      SELECT DATE_TRUNC($4, sub.date)::DATE AS periodo,
             COUNT(sub.id)    AS registros,
             ${COUNT_COSECHA} AS dias_cosecha,
             SUM(${CAST_MW})  AS total_valor
      FROM submissions sub
      WHERE sub.employee_id = $1 AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
      GROUP BY DATE_TRUNC($4, sub.date) ORDER BY periodo
    `, [e.id, desde, hasta, trunc]);
    return {
      summary: { empleado_id: e.id, nombre: e.nombre, sector: e.sector, agrupacion },
      trends: r.rows.map(x => ({ periodo: x.periodo, registros: +x.registros, ...valRow(x.total_valor, x.dias_cosecha) })),
      metadata: { periodo: { desde, hasta } },
    };
  }));

  // GET /api/stats/serie-temporal-sector?sector=&agrupacion=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/serie-temporal-sector', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, agrupacion = 'diario', periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const trunc = agrupacion === 'mensual' ? 'month' : agrupacion === 'semanal' ? 'week' : 'day';
    const params = [desde, hasta, trunc];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $4`) : '';
    const r = await db.query(`
      SELECT DATE_TRUNC($3, sub.date)::DATE AS periodo, s.name AS sector,
             COUNT(DISTINCT sub.employee_id) AS empleados,
             COUNT(sub.id)    AS registros,
             ${COUNT_COSECHA} AS dias_cosecha,
             SUM(${CAST_MW})  AS total_valor
      FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
      WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
      GROUP BY DATE_TRUNC($3, sub.date), s.id, s.name ORDER BY periodo, s.name
    `, params);
    return {
      summary: { agrupacion, sectores: [...new Set(r.rows.map(x=>x.sector))] },
      trends: r.rows.map(x => ({ periodo: x.periodo, sector: x.sector, empleados: +x.empleados, registros: +x.registros, ...valRow(x.total_valor, x.dias_cosecha) })),
      metadata: { periodo: { desde, hasta } },
    };
  }));

  // GET /api/stats/comparativa-periodos?periodo_a_desde=&periodo_a_hasta=&periodo_b_desde=&periodo_b_hasta=&sector=&empleado=
  app.get('/api/stats/comparativa-periodos', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { periodo_a_desde, periodo_a_hasta, periodo_b_desde, periodo_b_hasta, sector, empleado } = req.query;
    if (!periodo_a_desde || !periodo_a_hasta || !periodo_b_desde || !periodo_b_hasta) return { error: 'Parámetros periodo_a_desde, periodo_a_hasta, periodo_b_desde, periodo_b_hasta requeridos' };
    const buildQ = (desde, hasta) => {
      const p = [desde, hasta]; const conds = [];
      if (sector)   { p.push(`%${sector}%`);   conds.push(`AND s.name ILIKE $${p.length}`); }
      if (empleado) { p.push(`%${empleado}%`);  conds.push(`AND (e.first_name ILIKE $${p.length} OR e.last_name ILIKE $${p.length} OR (e.first_name||' '||e.last_name) ILIKE $${p.length})`); }
      return { sql: `SELECT COUNT(DISTINCT sub.employee_id) AS empleados, COUNT(DISTINCT sub.date) AS dias_activos, COUNT(sub.id) AS registros, ${COUNT_COSECHA} AS dias_cosecha, SUM(${CAST_MW}) AS total_valor FROM submissions sub JOIN employees e ON e.id = sub.employee_id JOIN sectors s ON s.id = sub.sector_id WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${conds.join(' ')}`, p };
    };
    const qa = buildQ(periodo_a_desde, periodo_a_hasta);
    const qb = buildQ(periodo_b_desde, periodo_b_hasta);
    const [ra, rb] = await Promise.all([db.query(qa.sql, qa.p), db.query(qb.sql, qb.p)]);
    const a = ra.rows[0], b = rb.rows[0];
    const diff = (va, vb) => vb > 0 ? +((va-vb)/vb*100).toFixed(1) : null;
    return {
      periodo_a: { desde: periodo_a_desde, hasta: periodo_a_hasta },
      periodo_b: { desde: periodo_b_desde, hasta: periodo_b_hasta },
      comparativa: {
        empleados:    { a: +a.empleados,    b: +b.empleados,    variacion_pct: diff(+a.empleados,    +b.empleados) },
        dias_activos: { a: +a.dias_activos, b: +b.dias_activos, variacion_pct: diff(+a.dias_activos, +b.dias_activos) },
        registros:    { a: +a.registros,    b: +b.registros,    variacion_pct: diff(+a.registros,    +b.registros) },
        dias_cosecha: { a: +a.dias_cosecha, b: +b.dias_cosecha, variacion_pct: diff(+a.dias_cosecha, +b.dias_cosecha) },
        importe_total: { a: +(+a.total_valor||0).toFixed(2), b: +(+b.total_valor||0).toFixed(2), variacion_pct: diff(+a.total_valor||0, +b.total_valor||0) },
        horas_totales: { a: horas(+a.total_valor||0), b: horas(+b.total_valor||0) },
      },
    };
  }));

  // GET /api/stats/ausencias-por-empleado?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/ausencias-por-empleado', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const params = [desde, hasta];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $3`) : '';
    const r = await db.query(`
      SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni, s.name AS sector,
             COUNT(a.id) AS episodios,
             SUM(a.end_date - a.start_date + 1) AS total_dias,
             COUNT(a.id) FILTER (WHERE a.is_justified) AS con_certificado
      FROM absences a JOIN employees e ON e.id = a.employee_id JOIN sectors s ON s.id = e.sector_id
      WHERE a.start_date <= $2 AND a.end_date >= $1 ${cond}
      GROUP BY e.id, e.first_name, e.last_name, e.dni, s.name
      ORDER BY total_dias DESC LIMIT 200
    `, params);
    return {
      summary: { total_empleados_ausentes: r.rows.length, total_dias_ausencia: r.rows.reduce((s,x)=>s+ +x.total_dias,0), con_certificado: r.rows.reduce((s,x)=>s+ +x.con_certificado,0) },
      rows: r.rows.map(x => ({ empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, sector: x.sector, episodios: +x.episodios, total_dias: +x.total_dias, con_certificado: +x.con_certificado })),
      metadata: { periodo: { desde, hasta } },
    };
  }));

  // GET /api/stats/ausencias-por-sector?periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/ausencias-por-sector', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const r = await db.query(`
      SELECT s.id AS sector_id, s.name AS sector, s.encargado,
             COUNT(a.id) AS episodios, COUNT(DISTINCT a.employee_id) AS empleados_afectados,
             SUM(a.end_date - a.start_date + 1) AS total_dias,
             COUNT(a.id) FILTER (WHERE a.is_justified) AS con_certificado
      FROM absences a JOIN employees e ON e.id = a.employee_id JOIN sectors s ON s.id = e.sector_id
      WHERE a.start_date <= $2 AND a.end_date >= $1
      GROUP BY s.id, s.name, s.encargado ORDER BY total_dias DESC
    `, [desde, hasta]);
    return {
      summary: { total_dias: r.rows.reduce((s,x)=>s+ +x.total_dias,0), episodios: r.rows.reduce((s,x)=>s+ +x.episodios,0) },
      rows: r.rows.map(x => ({ sector_id: x.sector_id, sector: x.sector, encargado: x.encargado, episodios: +x.episodios, empleados_afectados: +x.empleados_afectados, total_dias: +x.total_dias, con_certificado: +x.con_certificado })),
      metadata: { periodo: { desde, hasta } },
    };
  }));

  // GET /api/stats/ranking-sector?sector=&top=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/ranking-sector', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, top = '50', periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!sector) return { error: 'Parámetro sector requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const sec = await db.query(`SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1`, [`%${sector}%`]);
    if (!sec.rows[0]) return { error: `Sector "${sector}" no encontrado` };
    const s = sec.rows[0];
    const r = await db.query(`
      SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni,
             COUNT(sub.id)    AS dias_trabajados,
             ${COUNT_COSECHA} AS dias_cosecha,
             SUM(${CAST_MW})  AS total_valor
      FROM employees e
      LEFT JOIN submissions sub ON sub.employee_id = e.id
        AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
      WHERE e.sector_id = $1 AND e.is_active
      GROUP BY e.id, e.first_name, e.last_name, e.dni
      ORDER BY COALESCE(SUM(${CAST_MW}),0) + COALESCE(${COUNT_COSECHA},0) DESC
      LIMIT $4
    `, [s.id, desde, hasta, parseInt(top)]);
    return {
      summary: { sector_id: s.id, sector: s.name, encargado: s.encargado, total_en_ranking: r.rows.length },
      rows: r.rows.map((x,i) => ({ posicion: i+1, empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, dias_trabajados: +x.dias_trabajados, ...valRow(x.total_valor, x.dias_cosecha) })),
      metadata: { periodo: { desde, hasta }, sector_id: s.id },
    };
  }));

  // GET /api/stats/metricas-empleado?busqueda=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/metricas-empleado', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { busqueda, periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!busqueda) return { error: 'Parámetro busqueda requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const r = await db.query(`
      WITH emp AS (
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
               e.is_active AS activo, e.created_at, s.id AS sector_id, s.name AS sector, s.encargado
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
      ),
      actual AS (
        SELECT COUNT(sub.id) AS dias, COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS cosecha,
               SUM(${CAST_MW}) AS valor
        FROM submissions sub, emp WHERE sub.employee_id = emp.id AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
      ),
      historico AS (
        SELECT AVG(val) AS promedio_mes FROM (
          SELECT DATE_TRUNC('month', sub.date) AS m, SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val
          FROM submissions sub, emp WHERE sub.employee_id = emp.id AND sub.date < $2 AND NOT sub.is_deleted GROUP BY m
        ) t
      ),
      ausencias AS (
        SELECT COUNT(a.id) AS episodios, SUM(a.end_date - a.start_date + 1) AS dias
        FROM absences a, emp WHERE a.employee_id = emp.id AND a.start_date <= $3 AND a.end_date >= $2
      )
      SELECT emp.*, a.dias AS a_dias, a.cosecha AS a_cosecha, a.valor AS a_valor,
             h.promedio_mes, ab.episodios AS ab_episodios, ab.dias AS ab_dias
      FROM emp, actual a, historico h, ausencias ab
    `, [`%${busqueda}%`, desde, hasta]);
    if (!r.rows[0]) return { error: `No se encontró empleado con "${busqueda}"` };
    const e = r.rows[0];
    const valorActual = (+e.a_valor||0) + +e.a_cosecha;
    const promMes = +e.promedio_mes||0;
    return {
      summary: {
        empleado_id: e.id, nombre: e.nombre, dni: e.dni, sector: e.sector, encargado: e.encargado, activo: e.activo,
        en_sistema_desde: e.created_at, dias_trabajados: +e.a_dias, dias_cosecha: +e.a_cosecha,
        ...(+e.a_valor > 0 ? { horas_totales: horas(+e.a_valor), importe_total: +(+e.a_valor).toFixed(2) } : {}),
        ausencias_episodios: +e.ab_episodios, ausencias_dias: +e.ab_dias||0,
        promedio_mensual_historico: +promMes.toFixed(2),
        tendencia_vs_historico_pct: promMes > 0 ? +((valorActual-promMes)/promMes*100).toFixed(1) : null,
      },
      metadata: { periodo: { desde, hasta }, empleado_id: e.id },
    };
  }));

  // GET /api/stats/metricas-sector?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/metricas-sector', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    if (!sector) return { error: 'Parámetro sector requerido' };
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const r = await db.query(`
      WITH sec AS (SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1),
      actual AS (
        SELECT COUNT(DISTINCT sub.employee_id) AS emps_activos, COUNT(sub.id) AS regs,
               COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS cosecha, SUM(${CAST_MW}) AS valor
        FROM submissions sub, sec WHERE sub.sector_id = sec.id AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
      ),
      emp_count AS (SELECT COUNT(*) FILTER (WHERE e.is_active) AS activos FROM employees e, sec WHERE e.sector_id = sec.id),
      ausencias AS (
        SELECT COUNT(a.id) AS episodios, SUM(a.end_date - a.start_date + 1) AS dias
        FROM absences a JOIN employees e ON e.id = a.employee_id, sec
        WHERE e.sector_id = sec.id AND a.start_date <= $3 AND a.end_date >= $2
      ),
      historico AS (
        SELECT AVG(val) AS promedio_mes FROM (
          SELECT DATE_TRUNC('month', sub.date) AS m, SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val
          FROM submissions sub, sec WHERE sub.sector_id = sec.id AND sub.date < $2 AND NOT sub.is_deleted GROUP BY m
        ) t
      )
      SELECT sec.id AS sector_id, sec.name AS sector, sec.encargado,
             a.emps_activos, a.regs, a.cosecha, a.valor,
             ec.activos AS emp_activos,
             ab.episodios AS ab_episodios, ab.dias AS ab_dias,
             h.promedio_mes
      FROM sec, actual a, emp_count ec, ausencias ab, historico h
    `, [`%${sector}%`, desde, hasta]);
    if (!r.rows[0]) return { error: `Sector "${sector}" no encontrado` };
    const e = r.rows[0];
    const valorActual = (+e.valor||0) + +e.cosecha;
    const promMes = +e.promedio_mes||0;
    return {
      summary: {
        sector_id: e.sector_id, sector: e.sector, encargado: e.encargado,
        empleados_totales: +e.emp_activos, empleados_con_actividad: +e.emps_activos,
        registros: +e.regs, dias_cosecha: +e.cosecha,
        ...(+e.valor > 0 ? { horas_totales: horas(+e.valor), importe_total: +(+e.valor).toFixed(2) } : {}),
        ausencias_episodios: +e.ab_episodios, ausencias_dias: +e.ab_dias||0,
        promedio_mensual_historico: +promMes.toFixed(2),
        tendencia_vs_historico_pct: promMes > 0 ? +((valorActual-promMes)/promMes*100).toFixed(1) : null,
      },
      metadata: { periodo: { desde, hasta }, sector_id: e.sector_id },
    };
  }));

  // GET /api/stats/anomalias-empleados?sector=&umbral_pct=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/anomalias-empleados', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { sector, umbral_pct = '40', periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const umbral = parseFloat(umbral_pct) / 100;
    const params = [desde, hasta, umbral];
    const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $${params.length}`) : '';
    const r = await db.query(`
      WITH actual AS (
        SELECT sub.employee_id, SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_actual
        FROM submissions sub JOIN sectors s ON s.id=sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY sub.employee_id
      ),
      historico AS (
        SELECT sub.employee_id, AVG(val_mes) AS prom_mes FROM (
          SELECT sub.employee_id, DATE_TRUNC('month', sub.date) AS m,
                 SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_mes
          FROM submissions sub WHERE sub.date < $1 AND NOT sub.is_deleted GROUP BY sub.employee_id, m
        ) t GROUP BY sub.employee_id
      )
      SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni,
             s.name AS sector, a.val_actual, h.prom_mes,
             CASE WHEN h.prom_mes > 0 THEN ROUND(((a.val_actual - h.prom_mes) / h.prom_mes * 100)::NUMERIC, 1) END AS variacion_pct
      FROM actual a
      JOIN historico h ON h.employee_id = a.employee_id
      JOIN employees e ON e.id = a.employee_id
      JOIN sectors s ON s.id = e.sector_id
      WHERE h.prom_mes > 0 AND ABS((a.val_actual - h.prom_mes) / h.prom_mes) >= $3
      ORDER BY ABS((a.val_actual - h.prom_mes) / h.prom_mes) DESC LIMIT 50
    `, params);
    return {
      summary: { anomalias_detectadas: r.rows.length, umbral_pct: parseFloat(umbral_pct) },
      alerts: r.rows.map(x => ({ empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, sector: x.sector, valor_periodo: +x.val_actual, promedio_historico: +(+x.prom_mes).toFixed(2), variacion_pct: +x.variacion_pct, tipo: +x.variacion_pct > 0 ? 'subida' : 'caida' })),
      metadata: { periodo: { desde, hasta }, umbral_pct: parseFloat(umbral_pct) },
    };
  }));

  // GET /api/stats/anomalias-sectores?umbral_pct=&periodo_predefinido=&fecha_desde=&fecha_hasta=
  app.get('/api/stats/anomalias-sectores', { preHandler: verifyAdmin }, cached(TTL_LARGO, async (req) => {
    const { umbral_pct = '30', periodo_predefinido, fecha_desde, fecha_hasta } = req.query;
    const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
    const r = await db.query(`
      WITH actual AS (
        SELECT sub.sector_id, SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_actual
        FROM submissions sub WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted GROUP BY sub.sector_id
      ),
      historico AS (
        SELECT sub.sector_id, AVG(val_mes) AS prom_mes FROM (
          SELECT sub.sector_id, DATE_TRUNC('month', sub.date) AS m,
                 SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_mes
          FROM submissions sub WHERE sub.date < $1 AND NOT sub.is_deleted GROUP BY sub.sector_id, m
        ) t GROUP BY sub.sector_id
      )
      SELECT s.id AS sector_id, s.name AS sector, s.encargado, a.val_actual, h.prom_mes,
             ROUND(((a.val_actual - h.prom_mes) / h.prom_mes * 100)::NUMERIC, 1) AS variacion_pct
      FROM actual a JOIN historico h ON h.sector_id = a.sector_id JOIN sectors s ON s.id = a.sector_id
      WHERE h.prom_mes > 0 AND ABS((a.val_actual - h.prom_mes) / h.prom_mes) >= $3
      ORDER BY ABS((a.val_actual - h.prom_mes) / h.prom_mes) DESC
    `, [desde, hasta, parseFloat(umbral_pct) / 100]);
    return {
      summary: { anomalias_detectadas: r.rows.length, umbral_pct: parseFloat(umbral_pct) },
      alerts: r.rows.map(x => ({ sector_id: x.sector_id, sector: x.sector, encargado: x.encargado, valor_periodo: +x.val_actual, promedio_historico: +(+x.prom_mes).toFixed(2), variacion_pct: +x.variacion_pct, tipo: +x.variacion_pct > 0 ? 'subida' : 'caida' })),
      metadata: { periodo: { desde, hasta }, umbral_pct: parseFloat(umbral_pct) },
    };
  }));

  // GET /api/stats/metadata
  app.get('/api/stats/metadata', { preHandler: verifyAdmin }, cached(TTL_ESTATICO, async () => ({
    sistema: 'StaffAxis — gestión de personal agrícola',
    endpoints: [
      'GET /api/stats/resumen-general',
      'GET /api/stats/empleados?sector=&activos=&busqueda=',
      'GET /api/stats/empleados-incompletos?sector=',
      'GET /api/stats/actividad-por-sector?sector=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/ausencias?sector=&fecha_desde=&fecha_hasta=&con_certificado=',
      'GET /api/stats/ranking-empleados?sector=&fecha_desde=&fecha_hasta=&top=',
      'GET /api/stats/resumen-diario?fecha=',
      'GET /api/stats/resumen-mensual?año=&mes=&sector=',
      'GET /api/stats/historial-empleado?busqueda=',
      'GET /api/stats/comparativa-sectores?fecha_desde=&fecha_hasta=&tipo_carga=',
      'GET /api/stats/comparativa-empleados-mensual?sector=',
      'GET /api/stats/detalle-empleado-periodo?busqueda=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/detalle-sector-periodo?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/serie-temporal-empleado?busqueda=&agrupacion=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/serie-temporal-sector?sector=&agrupacion=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/comparativa-periodos?periodo_a_desde=&periodo_a_hasta=&periodo_b_desde=&periodo_b_hasta=',
      'GET /api/stats/ausencias-por-empleado?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/ausencias-por-sector?periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/ranking-sector?sector=&top=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/metricas-empleado?busqueda=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/metricas-sector?sector=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/anomalias-empleados?sector=&umbral_pct=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
      'GET /api/stats/anomalias-sectores?umbral_pct=&periodo_predefinido=&fecha_desde=&fecha_hasta=',
    ],
    periodos_predefinidos: ['hoy','ayer','semana_actual','semana_anterior','mes_actual','mes_anterior','ultimos_7_dias','ultimos_30_dias','ultimos_90_dias'],
    auth: 'Header x-admin-token: staffaxis_admin_token_2024_prod',
    cache: { datos_historicos: '5 min', datos_del_dia: '2 min', metadata: '1 hora' },
    reglas_de_negocio: {
      minutes_worked_C: 'Valor "C" indica día de cosecha',
      minutes_worked_pesos: 'Valor con $ indica monto en pesos (ej: "$10625.6")',
      minutes_worked_numero: 'Valor numérico indica minutos trabajados (480 = 8hs)',
    },
    campos_no_disponibles: ['legajo','puesto','categoria','supervisor_directo'],
  })));
}
