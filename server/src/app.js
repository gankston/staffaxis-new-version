import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

import { db } from './db.js';
import { authRoutes }       from './routes/auth.js';
import { sectorRoutes }     from './routes/sectors.js';
import { employeeRoutes }   from './routes/employees.js';
import { submissionRoutes } from './routes/submissions.js';
import { absenceRoutes }    from './routes/absences.js';
import { adminRoutes }      from './routes/admin.js';
import { mcpRoutes }        from './routes/mcp.js';
import { photoRoutes }      from './routes/photos.js';

// Migraciones automáticas al arrancar
async function runMigrations() {
  await db.query(`
    ALTER TABLE sectors ADD COLUMN IF NOT EXISTS sector_group TEXT DEFAULT NULL;
  `);
  await db.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dni_foto_frente TEXT DEFAULT NULL;
  `);
  await db.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dni_foto_dorso TEXT DEFAULT NULL;
  `);
}

const start = async () => {
  await runMigrations();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB por foto
  await app.register(authRoutes);
  await app.register(sectorRoutes);
  await app.register(employeeRoutes);
  await app.register(submissionRoutes);
  await app.register(absenceRoutes);
  await app.register(adminRoutes);
  await app.register(mcpRoutes);
  await app.register(photoRoutes);

  app.get('/health', async () => ({ ok: true }));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
};

start().catch(err => {
  console.error(err);
  process.exit(1);
});
