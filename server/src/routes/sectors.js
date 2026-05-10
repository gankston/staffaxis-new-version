import { db } from '../db.js';

export async function sectorRoutes(app) {

  // GET /api/sectors  — público, sin auth (la app lo llama antes de registrarse)
  app.get('/api/sectors', async (_req, reply) => {
    const result = await db.query(
      `SELECT s.id, s.name, s.tipo_carga, s.encargado,
              COUNT(e.id) FILTER (WHERE e.is_active) AS employee_count
       FROM sectors s
       LEFT JOIN employees e ON e.sector_id = s.id
       GROUP BY s.id
       ORDER BY s.name`
    );
    return reply.send({
      sectors: result.rows.map(s => ({
        id: s.id,
        name: s.name,
        tipoCarga: s.tipo_carga,
        encargado: s.encargado ?? null,
        employee_count: parseInt(s.employee_count ?? '0', 10),
      })),
    });
  });
}
