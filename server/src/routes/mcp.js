import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { db } from '../db.js';

function horas(minutos) {
  return Math.round(Number(minutos ?? 0) / 60 * 10) / 10;
}

// SQL para limpiar minutes_worked y castearlo a NUMERIC (excluye "C" de cosecha)
const CAST_MW = `CAST(NULLIF(REPLACE(REGEXP_REPLACE(NULLIF(sub.minutes_worked,'C'), '[^0-9.,]', '', 'g'), ',', '.'), '') AS NUMERIC)`;
// Cuenta días cosecha (minutes_worked = 'C')
const COUNT_COSECHA = `COUNT(sub.id) FILTER (WHERE sub.minutes_worked = 'C')`;

// Períodos predefinidos → { desde, hasta }
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

const PERIODO_PARAMS = {
  periodo_predefinido: z.enum(['hoy','ayer','semana_actual','semana_anterior','mes_actual','mes_anterior','ultimos_7_dias','ultimos_30_dias','ultimos_90_dias']).optional().describe('Período predefinido (alternativa a fecha_desde/hasta)'),
  fecha_desde: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
  fecha_hasta: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
};

function valRow(val, cosecha) {
  const obj = {};
  if (+cosecha > 0)  obj.dias_cosecha  = +cosecha;
  const v = +(+val ?? 0);
  if (v > 0) { obj.horas_totales = horas(v); obj.importe_total = +v.toFixed(2); }
  return obj;
}

function meta(desde, hasta, extra = {}) {
  return {
    periodo: { desde, hasta },
    fuente: 'StaffAxis',
    campos_no_disponibles: ['legajo','puesto','categoria','supervisor_directo','fecha_ingreso_real','tipo_ausencia'],
    ...extra,
  };
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
          COUNT(DISTINCT sub.employee_id)                    AS empleados,
          COUNT(DISTINCT sub.date)                           AS dias_activos,
          COUNT(sub.id)                                      AS total_registros,
          ${COUNT_COSECHA}                                   AS dias_cosecha,
          SUM(${CAST_MW})                                    AS total_valor
        FROM submissions sub
        JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY s.id, s.name, s.tipo_carga, s.encargado
        ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC
      `, params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            sectores: r.rows.map(row => {
              const obj = {
                sector: row.sector,
                encargado: row.encargado,
                empleados_con_registro: +row.empleados,
                dias_activos: +row.dias_activos,
                total_registros: +row.total_registros,
              };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) {
                obj.horas_totales = horas(val);
                obj.importe_total = +val.toFixed(2);
              }
              return obj;
            }),
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
               s.name AS sector,
               COUNT(sub.id)       AS dias_trabajados,
               ${COUNT_COSECHA}    AS dias_cosecha,
               SUM(${CAST_MW})     AS total_valor
        FROM submissions sub
        JOIN employees e ON e.id = sub.employee_id
        JOIN sectors s ON s.id = sub.sector_id
        WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
        GROUP BY e.id, e.first_name, e.last_name, e.dni, s.name
        ORDER BY COALESCE(SUM(${CAST_MW}), 0) + ${COUNT_COSECHA} DESC
        LIMIT $3
      `, params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            ranking: r.rows.map((row, i) => {
              const obj = {
                posicion: i + 1,
                empleado: row.empleado,
                dni: row.dni,
                sector: row.sector,
                dias_trabajados: +row.dias_trabajados,
              };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) {
                obj.horas_totales = horas(val);
                obj.importe_total = +val.toFixed(2);
              }
              return obj;
            }),
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
            ${COUNT_COSECHA} AS dias_cosecha,
            SUM(${CAST_MW})  AS total_valor
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
            actividad: subs.rows.map(row => {
              const obj = { sector: row.sector, encargado: row.encargado, empleados_registrados: +row.empleados };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
              return obj;
            }),
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
            sectores: sectores.rows.map(row => {
              const obj = { sector: row.sector, encargado: row.encargado, dias_activos: +row.dias_activos, empleados_unicos: +row.empleados_unicos, registros: +row.registros };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
              return obj;
            }),
            top_10_empleados: top10.rows.map((row, i) => {
              const obj = { posicion: i + 1, empleado: row.empleado, sector: row.sector, dias: +row.dias };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) { obj.horas_totales = horas(val); obj.importe_total = +val.toFixed(2); }
              return obj;
            }),
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
        content: [{
          type: 'text',
          text: JSON.stringify({
            periodo: { desde, hasta },
            sectores: r.rows.map(row => {
              const obj = {
                sector: row.sector,
                encargado: row.encargado,
                empleados_activos: +row.empleados_activos,
                dias_activos_en_periodo: +(row.dias_activos ?? 0),
                empleados_con_registro: +(row.empleados_con_registro ?? 0),
              };
              if (+row.dias_cosecha > 0) obj.dias_cosecha = +row.dias_cosecha;
              const val = +(+row.total_valor ?? 0);
              if (val > 0) {
                obj.horas_totales = horas(val);
                obj.importe_total = +val.toFixed(2);
                obj.promedio_por_registro = +(+row.promedio_por_registro ?? 0).toFixed(2);
              }
              return obj;
            }),
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

  // ── DETALLE EMPLEADO PERÍODO ───────────────────────────────────────────────
  server.tool('detalle_empleado_periodo',
    'Detalle completo de actividad de un empleado en un período: día a día, KPIs y ausencias.',
    { busqueda: z.string().describe('Nombre, apellido o DNI'), ...PERIODO_PARAMS },
    async ({ busqueda, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const emp = await db.query(`
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
               e.is_active AS activo, e.created_at, s.id AS sector_id, s.name AS sector, s.encargado
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
      `, [`%${busqueda}%`]);
      if (!emp.rows[0]) return { content: [{ type:'text', text: `No se encontró empleado con "${busqueda}".` }] };
      const e = emp.rows[0];

      const [dias, abs] = await Promise.all([
        db.query(`
          SELECT sub.date, sub.minutes_worked, sub.notes,
                 ${CAST_MW} AS valor
          FROM submissions sub JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.employee_id = $1 AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
          ORDER BY sub.date
        `, [e.id, desde, hasta]),
        db.query(`
          SELECT start_date, end_date, is_justified AS con_certificado, observations,
                 (end_date - start_date + 1) AS dias
          FROM absences WHERE employee_id = $1 AND start_date <= $3 AND end_date >= $2
        `, [e.id, desde, hasta]),
      ]);

      const diasCosecha = dias.rows.filter(r => r.minutes_worked === 'C').length;
      const totalValor  = dias.rows.reduce((s,r) => s + (+r.valor||0), 0);
      const diasTrabajados = dias.rows.length;

      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          empleado_id: e.id, nombre: e.nombre, dni: e.dni, sector: e.sector,
          encargado: e.encargado, activo: e.activo,
          dias_trabajados: diasTrabajados, dias_cosecha: diasCosecha,
          ...(totalValor > 0 ? { horas_totales: horas(totalValor), importe_total: +totalValor.toFixed(2) } : {}),
          ausencias_en_periodo: abs.rows.reduce((s,r) => s + +r.dias, 0),
        },
        rows: dias.rows.map(r => ({
          fecha: r.date,
          tipo: r.minutes_worked === 'C' ? 'cosecha' : (+r.valor > 480 ? 'importe' : 'horas'),
          minutes_worked: r.minutes_worked,
          valor: r.valor ? +r.valor : null,
          horas: r.valor ? horas(r.valor) : null,
          notas: r.notes || null,
        })),
        ausencias: abs.rows,
        metadata: meta(desde, hasta, { empleado_id: e.id }),
      }, null, 2) }] };
    }
  );

  // ── DETALLE SECTOR PERÍODO ─────────────────────────────────────────────────
  server.tool('detalle_sector_periodo',
    'Detalle de todos los empleados de un sector en un período con sus métricas individuales.',
    { sector: z.string().describe('Nombre o parte del nombre del sector'), ...PERIODO_PARAMS },
    async ({ sector, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const sec = await db.query(`SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1`, [`%${sector}%`]);
      if (!sec.rows[0]) return { content: [{ type:'text', text: `Sector "${sector}" no encontrado.` }] };
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

      const totalDias   = r.rows.reduce((a,x) => a + +x.dias_trabajados, 0);
      const totalCos    = r.rows.reduce((a,x) => a + +x.dias_cosecha, 0);
      const totalValor  = r.rows.reduce((a,x) => a + (+x.total_valor||0), 0);

      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          sector_id: s.id, sector: s.name, encargado: s.encargado,
          total_empleados: r.rows.length,
          empleados_activos: r.rows.filter(x => x.activo).length,
          empleados_con_actividad: r.rows.filter(x => +x.dias_trabajados > 0).length,
          total_dias_trabajados: totalDias,
          total_dias_cosecha: totalCos,
          ...(totalValor > 0 ? { horas_totales: horas(totalValor), importe_total: +totalValor.toFixed(2) } : {}),
        },
        rows: r.rows.map(x => ({
          empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, activo: x.activo,
          dias_trabajados: +x.dias_trabajados,
          ...valRow(x.total_valor, x.dias_cosecha),
        })),
        metadata: meta(desde, hasta, { sector_id: s.id }),
      }, null, 2) }] };
    }
  );

  // ── SERIE TEMPORAL EMPLEADO ────────────────────────────────────────────────
  server.tool('serie_temporal_empleado',
    'Serie temporal de actividad de un empleado agrupada por día, semana o mes.',
    {
      busqueda: z.string().describe('Nombre, apellido o DNI'),
      agrupacion: z.enum(['diario','semanal','mensual']).optional().describe('Granularidad (default: diario)'),
      ...PERIODO_PARAMS,
    },
    async ({ busqueda, agrupacion = 'diario', periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const emp = await db.query(`
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni, s.name AS sector
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
      `, [`%${busqueda}%`]);
      if (!emp.rows[0]) return { content: [{ type:'text', text: `No se encontró empleado con "${busqueda}".` }] };
      const e = emp.rows[0];

      const trunc = agrupacion === 'mensual' ? 'month' : agrupacion === 'semanal' ? 'week' : 'day';
      const r = await db.query(`
        SELECT DATE_TRUNC($4, sub.date)::DATE AS periodo,
               COUNT(sub.id)    AS registros,
               ${COUNT_COSECHA} AS dias_cosecha,
               SUM(${CAST_MW})  AS total_valor
        FROM submissions sub
        WHERE sub.employee_id = $1 AND sub.date BETWEEN $2 AND $3 AND NOT sub.is_deleted
        GROUP BY DATE_TRUNC($4, sub.date)
        ORDER BY periodo
      `, [e.id, desde, hasta, trunc]);

      return { content: [{ type:'text', text: JSON.stringify({
        summary: { empleado_id: e.id, nombre: e.nombre, sector: e.sector, agrupacion },
        trends: r.rows.map(x => ({
          periodo: x.periodo,
          registros: +x.registros,
          ...valRow(x.total_valor, x.dias_cosecha),
        })),
        metadata: meta(desde, hasta),
      }, null, 2) }] };
    }
  );

  // ── SERIE TEMPORAL SECTOR ──────────────────────────────────────────────────
  server.tool('serie_temporal_sector',
    'Serie temporal de actividad de un sector agrupada por día, semana o mes.',
    {
      sector: z.string().optional().describe('Nombre o parte del nombre del sector (omitir = todos)'),
      agrupacion: z.enum(['diario','semanal','mensual']).optional().describe('Granularidad (default: diario)'),
      ...PERIODO_PARAMS,
    },
    async ({ sector, agrupacion = 'diario', periodo_predefinido, fecha_desde, fecha_hasta }) => {
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
        GROUP BY DATE_TRUNC($3, sub.date), s.id, s.name
        ORDER BY periodo, s.name
      `, params);

      return { content: [{ type:'text', text: JSON.stringify({
        summary: { agrupacion, sectores: [...new Set(r.rows.map(x=>x.sector))] },
        trends: r.rows.map(x => ({
          periodo: x.periodo, sector: x.sector,
          empleados: +x.empleados, registros: +x.registros,
          ...valRow(x.total_valor, x.dias_cosecha),
        })),
        metadata: meta(desde, hasta),
      }, null, 2) }] };
    }
  );

  // ── COMPARATIVA PERÍODOS ───────────────────────────────────────────────────
  server.tool('comparativa_periodos',
    'Compara dos períodos cualesquiera a nivel general, por sector o por empleado.',
    {
      periodo_a_desde: z.string().describe('Período A inicio YYYY-MM-DD'),
      periodo_a_hasta: z.string().describe('Período A fin YYYY-MM-DD'),
      periodo_b_desde: z.string().describe('Período B inicio YYYY-MM-DD'),
      periodo_b_hasta: z.string().describe('Período B fin YYYY-MM-DD'),
      sector: z.string().optional().describe('Filtrar por sector'),
      empleado: z.string().optional().describe('Filtrar por nombre/DNI de empleado'),
    },
    async ({ periodo_a_desde, periodo_a_hasta, periodo_b_desde, periodo_b_hasta, sector, empleado }) => {
      const buildQ = (desde, hasta) => {
        const p = [desde, hasta];
        const conds = [];
        if (sector)   { p.push(`%${sector}%`);   conds.push(`AND s.name ILIKE $${p.length}`); }
        if (empleado) { p.push(`%${empleado}%`);  conds.push(`AND (e.first_name ILIKE $${p.length} OR e.last_name ILIKE $${p.length} OR (e.first_name||' '||e.last_name) ILIKE $${p.length})`); }
        return { sql: `
          SELECT COUNT(DISTINCT sub.employee_id) AS empleados,
                 COUNT(DISTINCT sub.date)        AS dias_activos,
                 COUNT(sub.id)                   AS registros,
                 ${COUNT_COSECHA}                AS dias_cosecha,
                 SUM(${CAST_MW})                 AS total_valor
          FROM submissions sub
          JOIN employees e ON e.id = sub.employee_id
          JOIN sectors s ON s.id = sub.sector_id
          WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${conds.join(' ')}
        `, p };
      };

      const qa = buildQ(periodo_a_desde, periodo_a_hasta);
      const qb = buildQ(periodo_b_desde, periodo_b_hasta);
      const [ra, rb] = await Promise.all([db.query(qa.sql, qa.p), db.query(qb.sql, qb.p)]);
      const a = ra.rows[0], b = rb.rows[0];

      const diff = (va, vb) => vb > 0 ? +((va - vb) / vb * 100).toFixed(1) : null;

      return { content: [{ type:'text', text: JSON.stringify({
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
        metadata: { fuente: 'StaffAxis', filtros: { sector: sector??null, empleado: empleado??null } },
      }, null, 2) }] };
    }
  );

  // ── AUSENCIAS POR EMPLEADO ─────────────────────────────────────────────────
  server.tool('ausencias_por_empleado',
    'Ausencias agrupadas por empleado en un período, ordenadas por total de días ausente.',
    { sector: z.string().optional(), ...PERIODO_PARAMS },
    async ({ sector, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const params = [desde, hasta];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $3`) : '';
      const r = await db.query(`
        SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni,
               s.name AS sector,
               COUNT(a.id) AS episodios,
               SUM(a.end_date - a.start_date + 1) AS total_dias,
               COUNT(a.id) FILTER (WHERE a.is_justified) AS con_certificado
        FROM absences a
        JOIN employees e ON e.id = a.employee_id
        JOIN sectors s ON s.id = e.sector_id
        WHERE a.start_date <= $2 AND a.end_date >= $1 ${cond}
        GROUP BY e.id, e.first_name, e.last_name, e.dni, s.name
        ORDER BY total_dias DESC LIMIT 200
      `, params);
      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          total_empleados_ausentes: r.rows.length,
          total_dias_ausencia: r.rows.reduce((s,x)=>s+ +x.total_dias,0),
          con_certificado: r.rows.reduce((s,x)=>s+ +x.con_certificado,0),
        },
        rows: r.rows.map(x=>({ empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, sector: x.sector, episodios: +x.episodios, total_dias: +x.total_dias, con_certificado: +x.con_certificado })),
        metadata: meta(desde, hasta),
      }, null, 2) }] };
    }
  );

  // ── AUSENCIAS POR SECTOR ───────────────────────────────────────────────────
  server.tool('ausencias_por_sector',
    'Ausencias agrupadas por sector en un período.',
    { ...PERIODO_PARAMS },
    async ({ periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const r = await db.query(`
        SELECT s.id AS sector_id, s.name AS sector, s.encargado,
               COUNT(a.id) AS episodios,
               COUNT(DISTINCT a.employee_id) AS empleados_afectados,
               SUM(a.end_date - a.start_date + 1) AS total_dias,
               COUNT(a.id) FILTER (WHERE a.is_justified) AS con_certificado
        FROM absences a
        JOIN employees e ON e.id = a.employee_id
        JOIN sectors s ON s.id = e.sector_id
        WHERE a.start_date <= $2 AND a.end_date >= $1
        GROUP BY s.id, s.name, s.encargado
        ORDER BY total_dias DESC
      `, [desde, hasta]);
      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          total_dias: r.rows.reduce((s,x)=>s+ +x.total_dias,0),
          episodios: r.rows.reduce((s,x)=>s+ +x.episodios,0),
        },
        rows: r.rows.map(x=>({ sector_id: x.sector_id, sector: x.sector, encargado: x.encargado, episodios: +x.episodios, empleados_afectados: +x.empleados_afectados, total_dias: +x.total_dias, con_certificado: +x.con_certificado })),
        metadata: meta(desde, hasta),
      }, null, 2) }] };
    }
  );

  // ── RANKING SECTOR ─────────────────────────────────────────────────────────
  server.tool('ranking_sector',
    'Ranking interno de empleados dentro de un sector en un período.',
    { sector: z.string().describe('Nombre o parte del nombre del sector'), top: z.number().int().min(1).max(200).optional(), ...PERIODO_PARAMS },
    async ({ sector, top = 50, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const sec = await db.query(`SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1`, [`%${sector}%`]);
      if (!sec.rows[0]) return { content: [{ type:'text', text: `Sector "${sector}" no encontrado.` }] };
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
      `, [s.id, desde, hasta, top]);
      return { content: [{ type:'text', text: JSON.stringify({
        summary: { sector_id: s.id, sector: s.name, encargado: s.encargado, total_en_ranking: r.rows.length },
        rows: r.rows.map((x,i)=>({ posicion: i+1, empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, dias_trabajados: +x.dias_trabajados, ...valRow(x.total_valor, x.dias_cosecha) })),
        metadata: meta(desde, hasta, { sector_id: s.id }),
      }, null, 2) }] };
    }
  );

  // ── MÉTRICAS EMPLEADO ──────────────────────────────────────────────────────
  server.tool('metricas_empleado',
    'KPIs compactos de un empleado: días trabajados, ausencias, promedio diario y tendencia.',
    { busqueda: z.string().describe('Nombre, apellido o DNI'), ...PERIODO_PARAMS },
    async ({ busqueda, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const emp = await db.query(`
        SELECT e.id, e.first_name||' '||e.last_name AS nombre, e.dni,
               e.is_active AS activo, e.created_at, s.id AS sector_id, s.name AS sector, s.encargado
        FROM employees e JOIN sectors s ON s.id = e.sector_id
        WHERE e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.dni ILIKE $1
          OR (e.first_name||' '||e.last_name) ILIKE $1 LIMIT 1
      `, [`%${busqueda}%`]);
      if (!emp.rows[0]) return { content: [{ type:'text', text: `No se encontró empleado con "${busqueda}".` }] };
      const e = emp.rows[0];

      const [actual, historico, abs] = await Promise.all([
        db.query(`SELECT COUNT(id) AS dias, ${COUNT_COSECHA} AS cosecha, SUM(${CAST_MW}) AS valor FROM submissions sub WHERE employee_id=$1 AND date BETWEEN $2 AND $3 AND NOT is_deleted`, [e.id, desde, hasta]),
        db.query(`SELECT AVG(val) AS promedio_mes FROM (SELECT DATE_TRUNC('month',date) AS m, SUM(${CAST_MW}) + COUNT(id) FILTER (WHERE minutes_worked='C') AS val FROM submissions sub WHERE employee_id=$1 AND date < $2 AND NOT is_deleted GROUP BY m) t`, [e.id, desde]),
        db.query(`SELECT COUNT(id) AS episodios, SUM(end_date-start_date+1) AS dias FROM absences WHERE employee_id=$1 AND start_date<=$3 AND end_date>=$2`, [e.id, desde, hasta]),
      ]);

      const a = actual.rows[0], h = historico.rows[0], ab = abs.rows[0];
      const valorActual = (+a.valor||0) + +a.cosecha;
      const promMes = +h.promedio_mes||0;

      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          empleado_id: e.id, nombre: e.nombre, dni: e.dni,
          sector: e.sector, encargado: e.encargado, activo: e.activo,
          en_sistema_desde: e.created_at,
          dias_trabajados: +a.dias,
          dias_cosecha: +a.cosecha,
          ...(+a.valor > 0 ? { horas_totales: horas(+a.valor), importe_total: +(+a.valor).toFixed(2) } : {}),
          ausencias_episodios: +ab.episodios,
          ausencias_dias: +ab.dias||0,
          promedio_mensual_historico: +promMes.toFixed(2),
          tendencia_vs_historico_pct: promMes > 0 ? +((valorActual - promMes)/promMes*100).toFixed(1) : null,
        },
        metadata: meta(desde, hasta, { empleado_id: e.id, campos_no_disponibles: ['legajo','puesto','categoria','fecha_ingreso_real'] }),
      }, null, 2) }] };
    }
  );

  // ── MÉTRICAS SECTOR ────────────────────────────────────────────────────────
  server.tool('metricas_sector',
    'KPIs compactos de un sector: actividad, empleados, ausencias, promedios y tendencia.',
    { sector: z.string().describe('Nombre o parte del nombre del sector'), ...PERIODO_PARAMS },
    async ({ sector, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const sec = await db.query(`SELECT id, name, encargado FROM sectors WHERE name ILIKE $1 LIMIT 1`, [`%${sector}%`]);
      if (!sec.rows[0]) return { content: [{ type:'text', text: `Sector "${sector}" no encontrado.` }] };
      const s = sec.rows[0];

      const [act, emp, abs, hist] = await Promise.all([
        db.query(`SELECT COUNT(DISTINCT employee_id) AS emps_activos, COUNT(id) AS regs, ${COUNT_COSECHA} AS cosecha, SUM(${CAST_MW}) AS valor FROM submissions sub WHERE sector_id=$1 AND date BETWEEN $2 AND $3 AND NOT is_deleted`, [s.id, desde, hasta]),
        db.query(`SELECT COUNT(*) FILTER (WHERE is_active) AS activos FROM employees WHERE sector_id=$1`, [s.id]),
        db.query(`SELECT COUNT(a.id) AS episodios, SUM(a.end_date-a.start_date+1) AS dias FROM absences a JOIN employees e ON e.id=a.employee_id WHERE e.sector_id=$1 AND a.start_date<=$3 AND a.end_date>=$2`, [s.id, desde, hasta]),
        db.query(`SELECT AVG(val) AS promedio_mes FROM (SELECT DATE_TRUNC('month',date) AS m, SUM(${CAST_MW}) + COUNT(id) FILTER (WHERE minutes_worked='C') AS val FROM submissions sub WHERE sector_id=$1 AND date < $2 AND NOT is_deleted GROUP BY m) t`, [s.id, desde]),
      ]);

      const a = act.rows[0], valorActual = (+a.valor||0) + +a.cosecha, promMes = +hist.rows[0].promedio_mes||0;

      return { content: [{ type:'text', text: JSON.stringify({
        summary: {
          sector_id: s.id, sector: s.name, encargado: s.encargado,
          empleados_totales: +emp.rows[0].activos,
          empleados_con_actividad: +a.emps_activos,
          registros: +a.regs,
          dias_cosecha: +a.cosecha,
          ...(+a.valor > 0 ? { horas_totales: horas(+a.valor), importe_total: +(+a.valor).toFixed(2) } : {}),
          ausencias_episodios: +abs.rows[0].episodios,
          ausencias_dias: +abs.rows[0].dias||0,
          promedio_mensual_historico: +promMes.toFixed(2),
          tendencia_vs_historico_pct: promMes > 0 ? +((valorActual-promMes)/promMes*100).toFixed(1) : null,
        },
        metadata: meta(desde, hasta, { sector_id: s.id }),
      }, null, 2) }] };
    }
  );

  // ── ANOMALÍAS EMPLEADOS ────────────────────────────────────────────────────
  server.tool('anomalias_empleados',
    'Detecta empleados con actividad significativamente diferente a su promedio histórico en el período.',
    { sector: z.string().optional(), umbral_pct: z.number().optional().describe('Desvío mínimo % para considerar anomalía (default 40)'), ...PERIODO_PARAMS },
    async ({ sector, umbral_pct = 40, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const params = [desde, hasta, umbral_pct / 100];
      const cond = sector ? (params.push(`%${sector}%`), `AND s.name ILIKE $${params.length}`) : '';
      const r = await db.query(`
        WITH actual AS (
          SELECT sub.employee_id,
                 SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_actual
          FROM submissions sub JOIN sectors s ON s.id=sub.sector_id
          WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted ${cond}
          GROUP BY sub.employee_id
        ),
        historico AS (
          SELECT sub.employee_id,
                 AVG(val_mes) AS prom_mes
          FROM (
            SELECT sub.employee_id, DATE_TRUNC('month', sub.date) AS m,
                   SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_mes
            FROM submissions sub
            WHERE sub.date < $1 AND NOT sub.is_deleted
            GROUP BY sub.employee_id, m
          ) t GROUP BY sub.employee_id
        )
        SELECT e.id AS empleado_id, e.first_name||' '||e.last_name AS nombre, e.dni,
               s.name AS sector, a.val_actual, h.prom_mes,
               CASE WHEN h.prom_mes > 0 THEN ROUND(((a.val_actual - h.prom_mes) / h.prom_mes * 100)::NUMERIC, 1) END AS variacion_pct
        FROM actual a
        JOIN historico h ON h.employee_id = a.employee_id
        JOIN employees e ON e.id = a.employee_id
        JOIN sectors s ON s.id = e.sector_id
        WHERE h.prom_mes > 0
          AND ABS((a.val_actual - h.prom_mes) / h.prom_mes) >= $3
        ORDER BY ABS((a.val_actual - h.prom_mes) / h.prom_mes) DESC
        LIMIT 50
      `, params);

      return { content: [{ type:'text', text: JSON.stringify({
        summary: { anomalias_detectadas: r.rows.length, umbral_pct },
        alerts: r.rows.map(x => ({
          empleado_id: x.empleado_id, nombre: x.nombre, dni: x.dni, sector: x.sector,
          valor_periodo: +x.val_actual, promedio_historico: +(+x.prom_mes).toFixed(2),
          variacion_pct: +x.variacion_pct,
          tipo: +x.variacion_pct > 0 ? 'subida' : 'caida',
        })),
        metadata: meta(desde, hasta, { umbral_pct }),
      }, null, 2) }] };
    }
  );

  // ── ANOMALÍAS SECTORES ─────────────────────────────────────────────────────
  server.tool('anomalias_sectores',
    'Detecta sectores con actividad significativamente diferente a su promedio histórico.',
    { umbral_pct: z.number().optional().describe('Desvío mínimo % (default 30)'), ...PERIODO_PARAMS },
    async ({ umbral_pct = 30, periodo_predefinido, fecha_desde, fecha_hasta }) => {
      const { desde, hasta } = resolvePeriod(periodo_predefinido, fecha_desde, fecha_hasta);
      const r = await db.query(`
        WITH actual AS (
          SELECT sub.sector_id,
                 SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_actual
          FROM submissions sub
          WHERE sub.date BETWEEN $1 AND $2 AND NOT sub.is_deleted
          GROUP BY sub.sector_id
        ),
        historico AS (
          SELECT sub.sector_id, AVG(val_mes) AS prom_mes
          FROM (
            SELECT sub.sector_id, DATE_TRUNC('month', sub.date) AS m,
                   SUM(${CAST_MW}) + COUNT(sub.id) FILTER (WHERE sub.minutes_worked='C') AS val_mes
            FROM submissions sub WHERE sub.date < $1 AND NOT sub.is_deleted
            GROUP BY sub.sector_id, m
          ) t GROUP BY sub.sector_id
        )
        SELECT s.id AS sector_id, s.name AS sector, s.encargado,
               a.val_actual, h.prom_mes,
               ROUND(((a.val_actual - h.prom_mes) / h.prom_mes * 100)::NUMERIC, 1) AS variacion_pct
        FROM actual a
        JOIN historico h ON h.sector_id = a.sector_id
        JOIN sectors s ON s.id = a.sector_id
        WHERE h.prom_mes > 0
          AND ABS((a.val_actual - h.prom_mes) / h.prom_mes) >= $3
        ORDER BY ABS((a.val_actual - h.prom_mes) / h.prom_mes) DESC
      `, [desde, hasta, umbral_pct / 100]);

      return { content: [{ type:'text', text: JSON.stringify({
        summary: { anomalias_detectadas: r.rows.length, umbral_pct },
        alerts: r.rows.map(x => ({
          sector_id: x.sector_id, sector: x.sector, encargado: x.encargado,
          valor_periodo: +x.val_actual, promedio_historico: +(+x.prom_mes).toFixed(2),
          variacion_pct: +x.variacion_pct,
          tipo: +x.variacion_pct > 0 ? 'subida' : 'caida',
        })),
        metadata: meta(desde, hasta, { umbral_pct }),
      }, null, 2) }] };
    }
  );

  // ── METADATA RRHH ──────────────────────────────────────────────────────────
  server.tool('metadata_rrhh',
    'Describe las métricas, dimensiones, filtros y reglas de negocio disponibles en el sistema.',
    {},
    async () => ({ content: [{ type:'text', text: JSON.stringify({
      sistema: 'StaffAxis — gestión de personal agrícola',
      tools_disponibles: [
        'resumen_general','empleados','actividad_por_sector','ausencias','ranking_empleados',
        'resumen_diario','resumen_mensual','historial_empleado','comparativa_sectores',
        'comparativa_empleados_mensual','detalle_empleado_periodo','detalle_sector_periodo',
        'serie_temporal_empleado','serie_temporal_sector','comparativa_periodos',
        'ausencias_por_empleado','ausencias_por_sector','ranking_sector',
        'metricas_empleado','metricas_sector','anomalias_empleados','anomalias_sectores',
      ],
      periodos_predefinidos: ['hoy','ayer','semana_actual','semana_anterior','mes_actual','mes_anterior','ultimos_7_dias','ultimos_30_dias','ultimos_90_dias'],
      dimensiones: {
        empleado: ['empleado_id (UUID estable)','nombre','dni','activo','sector','encargado','created_at'],
        sector:   ['sector_id (UUID estable)','name','encargado','tipo_carga'],
      },
      metricas: {
        dias_trabajados: 'Cantidad de registros en submissions en el período',
        dias_cosecha:    'Días con minutes_worked = "C" (marca de presencia en cosecha)',
        horas_totales:   'Suma de minutes_worked numérico / 60 (sectores de horas)',
        importe_total:   'Suma de minutes_worked numérico (sectores de importe/monto, en pesos)',
        ausencias_dias:  'Suma de días entre start_date y end_date en tabla absences',
      },
      reglas_de_negocio: {
        minutes_worked_C:       'Valor "C" indica día de cosecha, se cuenta aparte como dias_cosecha',
        minutes_worked_signo_$: 'Valor con $ indica monto en pesos (ej: "$10625.6")',
        minutes_worked_numero:  'Valor numérico puro indica minutos trabajados (480 = 8hs)',
        tipo_carga:             'Todos los sectores tienen tipo_carga = "importe" en DB (campo no discrimina horas vs monto)',
        ausencias_tipo:         'Solo se distingue con_certificado (boolean), no hay categorías de ausencia',
      },
      campos_no_disponibles: ['legajo','puesto','categoria','supervisor_directo','fecha_ingreso_real','tipo_ausencia_categorizado'],
    }, null, 2) }] })
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
