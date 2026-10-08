import { db } from '../db.js';

export async function sectorRoutes(app) {

  // GET /api/sectors  — público, sin auth (la app lo llama antes de registrarse)
  // Los sectores archivados no salen (los telefonos no los tienen que ver);
  // StaffAdmin los pide con ?incluir_archivados=1 para poder mostrarlos aparte.
  app.get('/api/sectors', async (req, reply) => {
    const incluirArchivados = req.query?.incluir_archivados === '1';
    const result = await db.query(
      `SELECT s.id, s.name, s.tipo_carga, s.encargado, s.archivado,
              COUNT(e.id) FILTER (WHERE e.is_active) AS employee_count,
              COALESCE(
                (SELECT ARRAY_AGG(stc.tipo ORDER BY stc.tipo) FROM sector_tipos_carga stc WHERE stc.sector_id = s.id),
                '{}'
              ) AS tipos_carga,
              -- Sectores a los que el encargado de este se puede cambiar aunque el
              -- encargado del otro sea otra persona (ver sector_vinculos).
              COALESCE(
                (SELECT ARRAY_AGG(sv.vinculado_id) FROM sector_vinculos sv WHERE sv.sector_id = s.id),
                '{}'
              ) AS vinculados
       FROM sectors s
       LEFT JOIN employees e ON e.sector_id = s.id
       WHERE $1::boolean OR NOT s.archivado
       GROUP BY s.id
       ORDER BY s.name`,
      [incluirArchivados]
    );
    // StaffAdmin pide ?tarjas_del=YYYY-MM-DD (con su token) para pintar cada sector
    // en verde/rojo con un solo pedido; antes hacia un /api/admin/report por sector.
    // Misma cuenta que ese reporte: tarjas no borradas del sector en ese dia.
    let tarjasDia = null;
    const dia = req.query?.tarjas_del;
    if (typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) &&
        req.headers['x-admin-token'] && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) {
      const t = await db.query(
        `SELECT s.sector_id, count(*)::int AS n
         FROM submissions s JOIN employees e ON e.id = s.employee_id
         WHERE s.date = $1::date AND NOT s.is_deleted
         GROUP BY s.sector_id`,
        [dia]
      );
      tarjasDia = new Map(t.rows.map((x) => [x.sector_id, x.n]));
    }
    return reply.send({
      sectors: result.rows.map(s => ({
        ...(tarjasDia ? { tarjas_dia: tarjasDia.get(s.id) ?? 0 } : {}),
        id: s.id,
        name: s.name,
        tipoCarga: s.tipo_carga,
        tiposCarga: s.tipos_carga,
        encargado: s.encargado ?? null,
        vinculados: s.vinculados,
        archivado: s.archivado,
        employee_count: parseInt(s.employee_count ?? '0', 10),
      })),
    });
  });
}
