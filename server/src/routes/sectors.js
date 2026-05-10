import { db } from '../db.js';

export async function sectorRoutes(app) {

  // GET /api/sectors  — público, sin auth (la app lo llama antes de registrarse)
  app.get('/api/sectors', async (_req, reply) => {
    const result = await db.query(
      'SELECT id, name, tipo_carga, encargado FROM sectors ORDER BY name'
    );
    return reply.send({
      sectors: result.rows.map(s => ({
        id: s.id,
        name: s.name,
        tipoCarga: s.tipo_carga,
        encargado: s.encargado ?? null,
      })),
    });
  });
}
