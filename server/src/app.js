import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { db } from './db.js';
import { authRoutes }       from './routes/auth.js';
import { sectorRoutes }     from './routes/sectors.js';
import { employeeRoutes }   from './routes/employees.js';
import { submissionRoutes } from './routes/submissions.js';
import { absenceRoutes }    from './routes/absences.js';
import { adminRoutes }      from './routes/admin.js';

// Migraciones automáticas al arrancar
async function runMigrations() {
  await db.query(`
    ALTER TABLE sectors ADD COLUMN IF NOT EXISTS sector_group TEXT DEFAULT NULL;
  `);
}

const start = async () => {
  await runMigrations();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(authRoutes);
  await app.register(sectorRoutes);
  await app.register(employeeRoutes);
  await app.register(submissionRoutes);
  await app.register(absenceRoutes);
  await app.register(adminRoutes);

  app.get('/health', async () => ({ ok: true }));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
};

start().catch(err => {
  console.error(err);
  process.exit(1);
});
