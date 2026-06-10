import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { db } from '../db.js';

function horas(minutos) {
  return Math.round(Number(minutos ?? 0) / 60 * 10) / 10;
}

function buildServer() {
  const server = new McpServer({
    name: 'staffaxis-stats',
    version: '1.0.0',
    description: 'Estadísticas del sistema StaffAxis — gestión de personal agrícola',
  });

  // ── RESUMEN GENERAL ────────────────────────────────────────────────────────
  server.tool(
    'resumen_general',
    'Resumen general del sistema: total de empleados activos/inactivos, sectores y actividad de los últimos 30 días.',
    {},
    async () => {
      const [emp, sec, subs, abs] = await Promise.all([
        db.query(`SELECT COUNT(*) FILTER (WHERE is_active) AS activos, COUNT(*) FILTER (WHERE NOT is_active) AS inactivos FROM employees`),
        db.query(`SELECT COUNT(*) AS total FROM sectors`),
        db.query(`SELECT COUNT(*) AS registros, COUNT(DISTINCT sector_id) AS sectores_activos, COUNT(DISTINCT employee_id) AS empleados_activos FROM submissions WHERE date >= CURRENT_DATE - 30 AND NOT is_deleted`),
        db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_justified) AS justificadas FROM absences WHERE start_date >= CURRENT_DATE - 30`),
      ]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            empleados: { activos: +emp.rows[0].activos, inactivos: +emp.rows[0].inactivos },
            sectores: { total: +sec.rows[0].total },
            ultimos_30_dias: {
              registros_de_trabajo: +subs.rows[0].registros,
              sectores_con_actividad: +subs.rows[0].sectores_activos,
              empleados_con_registro: +subs.rows[0].empleados_activos,
              ausencias: +abs.rows[0].total,
              ausencias_con_certificado: +abs.rows[0].justificadas,
            },
          }, null, 2),
        }],
      };
    }
  );

  // ── EMPLEADOS ──────────────────────────────────────────────────────────────
  server.tool(
    'empleados',
    'Lista y busca empleados. Filtrable por sector, estado activo/inactivo o nombre/DNI.',
    {
      sector: z.string().optional().describe('Nombre o parte del nombre del sector'),
      activos: z.boolean().optional().describe('true = solo activos, false = solo inactivos, omitir = todos'),
      busqueda: z.string().optional().describe('Buscar por nombre, apellido o DNI'),
    },
    async ({ sector, activos, busqueda }) => {
      const conds = [];
      const params = [];
      let i = 1;
      if (activos !== undefined) { conds.push(`e.is_active = $${i++}`); params.push(activos); }
      if (sector) { conds.push(`s.name ILIKE $${i++}`); params.push(`%${sector}%`); }
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
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ total: r.rows.length, empleados: r.rows }, null, 2),
        }],
      };
    }
  );

  // ── ACTIVIDAD POR SECTOR ───────────────────────────────────────────────────
  server.tool(
    'actividad_por_sector',
    'Horas trabajadas o importe registrado por sector en un período. Sectores tipo "horas" muestran horas; tipo "importe" muestran el monto total.',
    {
      sector: z.string().optional().describe('Nombre o parte del nombre del sector'),
      fecha_desde: z.string().optional().describe('Fecha inicio YYYY-MM-DD (default: hace 30 días)'),
      fecha_hasta: z.string().optional().describe('Fecha fin YYYY-MM-DD (default: hoy)'),
    },
    async ({ sector, fecha_desde, fecha_hasta }) => {
      const desde = fecha_desde ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const hasta = fecha_hasta ?? new Date().toISOString().slice(0, 10);
      const params = [desde, hasta];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $3`) : '';
      const r = await db.query(`
        SELECT s.name AS sector, s.tipo_carga, s.encargado,
          COUNT(DISTINCT sub.employee_id) AS empleados,
          COUNT(DISTINCT sub.date)        AS dias_activos,
          COUNT(sub.id)                   AS total_registros,
          SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor
        FROM submissions sub
        JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY s.id, s.name, s.tipo_carga, s.encargado
        ORDER BY total_valor DESC NULLS LAST
      `, params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            sectores: r.rows.map(row => ({
              sector: row.sector,
              encargado: row.encargado,
              tipo: row.tipo_carga,
              empleados_con_registro: +row.empleados,
              dias_activos: +row.dias_activos,
              total_registros: +row.total_registros,
              ...(row.tipo_carga === 'horas'
                ? { horas_totales: horas(row.total_valor) }
                : { importe_total: +(+row.total_valor ?? 0).toFixed(2) }),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── AUSENCIAS ──────────────────────────────────────────────────────────────
  server.tool(
    'ausencias',
    'Reporte de ausencias filtrable por sector, período y si tiene certificado médico.',
    {
      sector: z.string().optional().describe('Nombre o parte del nombre del sector'),
      fecha_desde: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      fecha_hasta: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      con_certificado: z.boolean().optional().describe('true = solo con certificado, false = sin certificado'),
    },
    async ({ sector, fecha_desde, fecha_hasta, con_certificado }) => {
      const desde = fecha_desde ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const hasta = fecha_hasta ?? new Date().toISOString().slice(0, 10);
      const conds = [`a.start_date <= $2 AND a.end_date >= $1`];
      const params = [desde, hasta];
      let i = 3;
      if (sector) { conds.push(`s.name ILIKE $${i++}`); params.push(`%${sector}%`); }
      if (con_certificado !== undefined) { conds.push(`a.is_justified = $${i++}`); params.push(con_certificado); }
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
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            resumen: {
              total: r.rows.length,
              con_certificado: r.rows.filter(x => x.con_certificado).length,
              sin_certificado: r.rows.filter(x => !x.con_certificado).length,
            },
            ausencias: r.rows,
          }, null, 2),
        }],
      };
    }
  );

  // ── RANKING EMPLEADOS ──────────────────────────────────────────────────────
  server.tool(
    'ranking_empleados',
    'Top empleados por horas trabajadas o importe en un período.',
    {
      sector: z.string().optional().describe('Nombre o parte del nombre del sector'),
      fecha_desde: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      fecha_hasta: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      top: z.number().int().min(1).max(100).optional().describe('Cantidad a mostrar (default 20)'),
    },
    async ({ sector, fecha_desde, fecha_hasta, top = 20 }) => {
      const desde = fecha_desde ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const hasta = fecha_hasta ?? new Date().toISOString().slice(0, 10);
      const params = [desde, hasta, top];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $4`) : '';
      const r = await db.query(`
        SELECT e.first_name||' '||e.last_name AS empleado, e.dni,
               s.name AS sector, s.tipo_carga,
               COUNT(sub.id) AS dias_trabajados,
               SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor
        FROM submissions sub
        JOIN employees e ON e.id = sub.employee_id
        JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY e.id, e.first_name, e.last_name, e.dni, s.name, s.tipo_carga
        ORDER BY total_valor DESC NULLS LAST
        LIMIT $3
      `, params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            ranking: r.rows.map((row, i) => ({
              posicion: i + 1,
              empleado: row.empleado,
              dni: row.dni,
              sector: row.sector,
              dias_trabajados: +row.dias_trabajados,
              ...(row.tipo_carga === 'horas'
                ? { horas_totales: horas(row.total_valor) }
                : { importe_total: +(+row.total_valor ?? 0).toFixed(2) }),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── RESUMEN DIARIO ─────────────────────────────────────────────────────────
  server.tool(
    'resumen_diario',
    'Resumen de actividad de un día específico: registros por sector, empleados presentes y ausencias.',
    {
      fecha: z.string().optional().describe('Fecha YYYY-MM-DD (default: hoy)'),
    },
    async ({ fecha }) => {
      const dia = fecha ?? new Date().toISOString().slice(0, 10);
      const [subs, abs] = await Promise.all([
        db.query(`
          SELECT s.name AS sector, s.tipo_carga, s.encargado,
            COUNT(DISTINCT sub.employee_id) AS empleados,
            SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor
          FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.date = $1 AND NOT sub.is_deleted
          GROUP BY s.id, s.name, s.tipo_carga, s.encargado ORDER BY s.name
        `, [dia]),
        db.query(`
          SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_justified) AS con_certificado
          FROM absences WHERE start_date <= $1 AND end_date >= $1
        `, [dia]),
      ]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            fecha: dia,
            ausencias: { total: +abs.rows[0].total, con_certificado: +abs.rows[0].con_certificado },
            sectores_con_actividad: subs.rows.length,
            actividad: subs.rows.map(row => ({
              sector: row.sector,
              encargado: row.encargado,
              tipo: row.tipo_carga,
              empleados_registrados: +row.empleados,
              ...(row.tipo_carga === 'horas'
                ? { horas_totales: horas(row.total_valor) }
                : { importe_total: +(+row.total_valor ?? 0).toFixed(2) }),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── RESUMEN MENSUAL ────────────────────────────────────────────────────────
  server.tool(
    'resumen_mensual',
    'Resumen completo de un mes: totales por sector, top empleados y ausencias.',
    {
      año: z.number().int().min(2020).max(2100).optional().describe('Año (default: actual)'),
      mes: z.number().int().min(1).max(12).optional().describe('Mes 1-12 (default: actual)'),
      sector: z.string().optional().describe('Filtrar por sector específico'),
    },
    async ({ año, mes, sector }) => {
      const hoy = new Date();
      const y = año ?? hoy.getFullYear();
      const m = mes ?? (hoy.getMonth() + 1);
      const desde = `${y}-${String(m).padStart(2, '0')}-01`;
      const hasta = new Date(y, m, 0).toISOString().slice(0, 10);
      const params = [desde, hasta];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $3`) : '';

      const [sectores, top10, abs] = await Promise.all([
        db.query(`
          SELECT s.name AS sector, s.encargado, s.tipo_carga,
            COUNT(DISTINCT sub.date)        AS dias_activos,
            COUNT(DISTINCT sub.employee_id) AS empleados_unicos,
            COUNT(sub.id)                   AS registros,
            SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor
          FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
          GROUP BY s.id, s.name, s.encargado, s.tipo_carga
          ORDER BY total_valor DESC NULLS LAST
        `, params),
        db.query(`
          SELECT e.first_name||' '||e.last_name AS empleado, s.name AS sector, s.tipo_carga,
            COUNT(sub.id) AS dias,
            SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor
          FROM submissions sub
          JOIN employees e ON e.id = sub.employee_id
          JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
          GROUP BY e.id, e.first_name, e.last_name, s.name, s.tipo_carga
          ORDER BY total_valor DESC NULLS LAST LIMIT 10
        `, params),
        db.query(`
          SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_justified) AS con_certificado
          FROM absences WHERE start_date <= $2 AND end_date >= $1
        `, [desde, hasta]),
      ]);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { año: y, mes: m, desde, hasta },
            ausencias: { total: +abs.rows[0].total, con_certificado: +abs.rows[0].con_certificado },
            sectores: sectores.rows.map(row => ({
              sector: row.sector,
              encargado: row.encargado,
              tipo: row.tipo_carga,
              dias_activos: +row.dias_activos,
              empleados_unicos: +row.empleados_unicos,
              registros: +row.registros,
              ...(row.tipo_carga === 'horas'
                ? { horas_totales: horas(row.total_valor) }
                : { importe_total: +(+row.total_valor ?? 0).toFixed(2) }),
            })),
            top_10_empleados: top10.rows.map((row, i) => ({
              posicion: i + 1,
              empleado: row.empleado,
              sector: row.sector,
              dias: +row.dias,
              ...(row.tipo_carga === 'horas'
                ? { horas: horas(row.total_valor) }
                : { importe: +(+row.total_valor ?? 0).toFixed(2) }),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── HISTORIAL EMPLEADO ─────────────────────────────────────────────────────
  server.tool(
    'historial_empleado',
    'Historial completo de un empleado: sector actual, últimos registros de trabajo, ausencias y transferencias.',
    {
      busqueda: z.string().describe('Nombre, apellido o DNI del empleado'),
    },
    async ({ busqueda }) => {
      const emps = await db.query(`
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
               e.is_active AS activo, e.created_at, s.name AS sector_actual
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1
        LIMIT 5
      `, [`%${busqueda}%`]);
      if (!emps.rows.length) {
        return { content: [{ type: 'text', text: `No se encontró ningún empleado con "${busqueda}".` }] };
      }
      const emp = emps.rows[0];
      const [subs, abs, transfers] = await Promise.all([
        db.query(`
          SELECT sub.date, sub.minutes_worked, sub.notes, s.tipo_carga
          FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.employee_id = $1 AND NOT sub.is_deleted
          ORDER BY sub.date DESC LIMIT 60
        `, [emp.id]),
        db.query(`
          SELECT start_date, end_date, is_justified AS con_certificado, observations
          FROM absences WHERE employee_id = $1 ORDER BY start_date DESC LIMIT 20
        `, [emp.id]),
        db.query(`
          SELECT t.transferred_at, s1.name AS de_sector, s2.name AS a_sector
          FROM transfers t
          JOIN sectors s1 ON s1.id = t.from_sector_id
          JOIN sectors s2 ON s2.id = t.to_sector_id
          WHERE t.employee_id = $1 ORDER BY t.transferred_at DESC
        `, [emp.id]),
      ]);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            empleado: { nombre: emp.nombre, dni: emp.dni, activo: emp.activo, sector_actual: emp.sector_actual },
            ultimos_60_registros: subs.rows.map(r => ({
              fecha: r.date,
              ...(r.tipo_carga === 'horas'
                ? { horas: r.minutes_worked ? horas(r.minutes_worked) : null }
                : { importe: r.minutes_worked }),
              notas: r.notes || null,
            })),
            ausencias: abs.rows,
            transferencias: transfers.rows,
          }, null, 2),
        }],
      };
    }
  );

  // ── COMPARATIVA SECTORES ───────────────────────────────────────────────────
  server.tool(
    'comparativa_sectores',
    'Compara todos los sectores en un período: empleados activos, actividad y producción.',
    {
      fecha_desde: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
      fecha_hasta: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
      tipo_carga: z.enum(['horas', 'importe']).optional().describe('Filtrar por tipo de sector'),
    },
    async ({ fecha_desde, fecha_hasta, tipo_carga }) => {
      const desde = fecha_desde ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const hasta = fecha_hasta ?? new Date().toISOString().slice(0, 10);
      const params = [desde, hasta];
      const cond = tipo_carga ? (params.push(tipo_carga), `AND s.tipo_carga = $3`) : '';
      const r = await db.query(`
        SELECT s.name AS sector, s.encargado, s.tipo_carga,
          COUNT(DISTINCT e.id) FILTER (WHERE e.is_active)  AS empleados_activos,
          COUNT(DISTINCT sub.date)                          AS dias_activos,
          COUNT(DISTINCT sub.employee_id)                   AS empleados_con_registro,
          COUNT(sub.id)                                     AS total_registros,
          SUM(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS total_valor,
          AVG(CAST(NULLIF(sub.minutes_worked,'') AS NUMERIC)) AS promedio_por_registro
        FROM sectors s
        LEFT JOIN employees e ON e.sector_id = s.id
        LEFT JOIN submissions sub ON sub.sector_id = s.id
          AND sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted
        WHERE 1=1 ${cond}
        GROUP BY s.id, s.name, s.encargado, s.tipo_carga
        ORDER BY total_valor DESC NULLS LAST
      `, params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            sectores: r.rows.map(row => ({
              sector: row.sector,
              encargado: row.encargado,
              tipo: row.tipo_carga,
              empleados_activos: +row.empleados_activos,
              dias_activos_en_periodo: +(row.dias_activos ?? 0),
              empleados_con_registro: +(row.empleados_con_registro ?? 0),
              ...(row.tipo_carga === 'horas'
                ? {
                    horas_totales: horas(row.total_valor),
                    promedio_horas_por_registro: horas(row.promedio_por_registro),
                  }
                : {
                    importe_total: +(+row.total_valor ?? 0).toFixed(2),
                    promedio_por_registro: +(+row.promedio_por_registro ?? 0).toFixed(2),
                  }),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── COMPARATIVA EMPLEADOS MENSUAL ──────────────────────────────────────────
  server.tool(
    'comparativa_empleados_mensual',
    'Compara la cantidad de empleados activos entre el mes anterior y el mes actual, mostrando altas y bajas por sector.',
    {
      sector: z.string().optional().describe('Filtrar por sector específico'),
    },
    async ({ sector }) => {
      const hoy = new Date();
      const inicioEsteMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
      const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10);
      const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10);

      const params = [inicioEsteMes, inicioMesAnterior, finMesAnterior];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $${params.length}`) : '';

      const r = await db.query(`
        SELECT
          s.name AS sector,
          COUNT(*) FILTER (WHERE e.is_active)                                        AS activos_hoy,
          COUNT(*) FILTER (WHERE e.created_at < $1 AND (e.is_active OR e.updated_at > $3)) AS activos_mes_anterior,
          COUNT(*) FILTER (WHERE e.created_at >= $1)                                 AS altas_este_mes,
          COUNT(*) FILTER (WHERE NOT e.is_active AND e.updated_at >= $1)             AS bajas_este_mes,
          COUNT(*) FILTER (WHERE e.created_at BETWEEN $2 AND $3)                     AS altas_mes_anterior,
          COUNT(*) FILTER (WHERE NOT e.is_active AND e.updated_at BETWEEN $2 AND $3) AS bajas_mes_anterior
        FROM employees e
        JOIN sectors s ON s.id = e.sector_id
        WHERE 1=1 ${cond}
        GROUP BY s.id, s.name
        HAVING COUNT(*) > 0
        ORDER BY s.name
      `, params);

      const mesAnteriorNombre = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
        .toLocaleString('es-AR', { month: 'long', year: 'numeric' });
      const estesMesNombre = hoy.toLocaleString('es-AR', { month: 'long', year: 'numeric' });

      const totales = r.rows.reduce((acc, row) => ({
        activos_hoy: acc.activos_hoy + +row.activos_hoy,
        activos_mes_anterior: acc.activos_mes_anterior + +row.activos_mes_anterior,
        altas_este_mes: acc.altas_este_mes + +row.altas_este_mes,
        bajas_este_mes: acc.bajas_este_mes + +row.bajas_este_mes,
        altas_mes_anterior: acc.altas_mes_anterior + +row.altas_mes_anterior,
        bajas_mes_anterior: acc.bajas_mes_anterior + +row.bajas_mes_anterior,
      }), { activos_hoy: 0, activos_mes_anterior: 0, altas_este_mes: 0, bajas_este_mes: 0, altas_mes_anterior: 0, bajas_mes_anterior: 0 });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            mes_anterior: mesAnteriorNombre,
            mes_actual: estesMesNombre,
            totales_generales: {
              activos_mes_anterior: totales.activos_mes_anterior,
              activos_este_mes: totales.activos_hoy,
              variacion: totales.activos_hoy - totales.activos_mes_anterior,
              altas_mes_anterior: totales.altas_mes_anterior,
              bajas_mes_anterior: totales.bajas_mes_anterior,
              altas_este_mes: totales.altas_este_mes,
              bajas_este_mes: totales.bajas_este_mes,
            },
            por_sector: r.rows.map(row => ({
              sector: row.sector,
              mes_anterior: { activos: +row.activos_mes_anterior, altas: +row.altas_mes_anterior, bajas: +row.bajas_mes_anterior },
              este_mes: { activos: +row.activos_hoy, altas: +row.altas_este_mes, bajas: +row.bajas_este_mes },
              variacion: +row.activos_hoy - +row.activos_mes_anterior,
            })),
          }, null, 2),
        }],
      };
    }
  );

  return server;
}

export async function mcpRoutes(app) {
  app.post('/mcp', async (req, reply) => {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildServer();
      await server.connect(transport);
      reply.hijack();
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      if (!reply.sent) reply.status(500).send({ error: String(err) });
    }
  });

  app.get('/mcp', async (_req, reply) => {
    return reply.status(405).send({
      error: 'Usá POST /mcp para enviar mensajes MCP',
      info: 'Servidor MCP de StaffAxis activo',
    });
  });

  app.delete('/mcp', async (_req, reply) => {
    return reply.send({ ok: true });
  });
}
