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

// Espera a que la DB esté lista (la red interna de Railway puede tardar al arrancar).
// Reintenta con paciencia en vez de crashear al primer timeout.
async function waitForDb(retries = 15, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('DB lista');
      return true;
    } catch (err) {
      console.error(`DB no lista (intento ${i}/${retries}): ${err.message}`);
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}

// Migraciones idempotentes. Si fallan, se loguea pero NO se mata el server.
async function runMigrations() {
  await db.query(`
    ALTER TABLE sectors ADD COLUMN IF NOT EXISTS sector_group TEXT DEFAULT NULL;
  `);
  // Las fotos de DNI se guardan en el Railway Volume (archivos en disco).
  // En la DB solo queda el nombre del archivo de cada cara.
  await db.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dni_foto_frente TEXT DEFAULT NULL;
  `);
  await db.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dni_foto_dorso TEXT DEFAULT NULL;
  `);
}

const start = async () => {
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

  // El server arranca SIEMPRE, aunque la DB tarde — así no entra en crash loop.
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });

  // Migraciones después de levantar, esperando a la DB sin bloquear el arranque.
  const ready = await waitForDb();
  if (ready) {
    try {
      await runMigrations();
      console.log('Migraciones aplicadas');
    } catch (err) {
      console.error('Migraciones fallaron (server sigue arriba):', err.message);
    }
  } else {
    console.error('DB no respondió tras los reintentos; el server queda arriba igual');
  }
};

start().catch(err => {
  console.error('Fallo al arrancar el server:', err);
  process.exit(1);
});
