import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

import { db } from './db.js';
import { authRoutes }       from './routes/auth.js';
import { accessRequestRoutes } from './routes/accessRequests.js';
import { sectorRoutes }     from './routes/sectors.js';
import { employeeRoutes }   from './routes/employees.js';
import { submissionRoutes } from './routes/submissions.js';
import { absenceRoutes }    from './routes/absences.js';
import { adminRoutes }      from './routes/admin.js';
import { supervisorRoutes } from './routes/supervisor.js';
import { statsRoutes }      from './routes/stats.js';
import { photoRoutes }      from './routes/photos.js';
import { webAppRoutes, adminWebRoutes } from './routes/webApp.js';
import { certificadoRoutes, limpiarCertificadosHuerfanos } from './routes/certificados.js';
import { pushRoutes }       from './routes/push.js';
import { fueraTerminoRoutes } from './routes/fueraTermino.js';

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
  // Certificados medicos: el archivo va al Volume (como el DNI); en la base
  // queda el nombre del archivo y UNA FILA POR DIA cubierto. Borrado logico.
  await db.query(`
    CREATE TABLE IF NOT EXISTS certificados_medicos (
      id              UUID PRIMARY KEY,
      employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      archivo         TEXT NOT NULL,
      tipo_archivo    TEXT NOT NULL,
      nombre_original TEXT,
      observaciones   TEXT,
      is_deleted      BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS certificado_medico_dias (
      certificado_id UUID NOT NULL REFERENCES certificados_medicos(id) ON DELETE CASCADE,
      employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      fecha          DATE NOT NULL,
      is_deleted     BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (certificado_id, fecha)
    );
  `);
  // Sectores vinculados a mano: el encargado de uno puede cambiarse al otro (y al
  // reves) aunque los dos sectores tengan encargados distintos. Una fila por cada
  // direccion. Pedido: MOSCONI <-> RUTA 5 (06/10/2026).
  await db.query(`
    CREATE TABLE IF NOT EXISTS sector_vinculos (
      sector_id    UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
      vinculado_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
      PRIMARY KEY (sector_id, vinculado_id)
    );
  `);
  // Lista negra de RRHH (23/10/2026): DNIs que no se pueden dar de alta desde la
  // app de los encargados (ver lib/listaNegra.js). Solo el DNI y el nombre.
  await db.query(`
    CREATE TABLE IF NOT EXISTS lista_negra (
      dni        TEXT PRIMARY KEY,
      nombre     TEXT,
      cargado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Sectores archivados (07/10/2026). Un sector con historia (empleados, tarjas)
  // no se puede borrar sin perder la liquidacion: archivado deja de aparecer en
  // StaffAdmin y en la lista de los telefonos, pero todo queda guardado y se
  // puede desarchivar.
  await db.query(`
    ALTER TABLE sectors ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE sectors ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ;
  `);
  // Notificaciones al telefono (19/11/2026): a donde le llegan a cada telefono.
  // Un token de Firebase por telefono; sector_id es el sector actual del encargado.
  await db.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      token          TEXT PRIMARY KEY,
      device_id      TEXT NOT NULL,
      sector_id      UUID,
      supervisor_id  UUID,
      modelo         TEXT,
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS push_tokens_device ON push_tokens (device_id);
    CREATE INDEX IF NOT EXISTS push_tokens_sector ON push_tokens (sector_id);
  `);
  // Certificados con frente y dorso (19/11/2026). El archivo de siempre es el
  // frente; el dorso es opcional para no romper los que ya estan cargados.
  await db.query(`
    ALTER TABLE certificados_medicos ADD COLUMN IF NOT EXISTS archivo_dorso TEXT;
    ALTER TABLE certificados_medicos ADD COLUMN IF NOT EXISTS tipo_archivo_dorso TEXT;
    ALTER TABLE certificados_medicos ADD COLUMN IF NOT EXISTS nombre_original_dorso TEXT;
  `);
  // Tarja Fuera de Termino (19/11/2026), ver routes/fueraTermino.js. Las horas
  // quedan en fuera_termino_items (NO en submissions) hasta que RRHH autoriza.
  await db.query(`
    CREATE TABLE IF NOT EXISTS fuera_termino (
      id             UUID PRIMARY KEY,
      sector_id      UUID NOT NULL REFERENCES sectors(id),
      device_id      TEXT,
      encargado      TEXT,
      motivo         TEXT NOT NULL,
      fecha_desde    DATE NOT NULL,
      fecha_hasta    DATE NOT NULL,
      estado         TEXT NOT NULL DEFAULT 'borrador',
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
      enviado_en     TIMESTAMPTZ,
      verificado_por TEXT,
      verificado_en  TIMESTAMPTZ,
      rrhh_por       TEXT,
      rrhh_en        TIMESTAMPTZ,
      motivo_rechazo TEXT,
      resultado      JSONB
    );
    CREATE INDEX IF NOT EXISTS fuera_termino_estado ON fuera_termino (estado);
    CREATE INDEX IF NOT EXISTS fuera_termino_sector ON fuera_termino (sector_id);
    CREATE TABLE IF NOT EXISTS fuera_termino_items (
      id             UUID PRIMARY KEY,
      pedido_id      UUID NOT NULL REFERENCES fuera_termino(id) ON DELETE CASCADE,
      employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date           DATE NOT NULL,
      horas          NUMERIC,
      cuerpo         JSONB NOT NULL,
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (pedido_id, employee_id, date)
    );
    CREATE TABLE IF NOT EXISTS autorizantes (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre    TEXT NOT NULL,
      rol       TEXT NOT NULL,
      device_id TEXT,
      email     TEXT,
      activo    BOOLEAN NOT NULL DEFAULT true,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fuera_termino_id UUID;
  `);
  // Un dia de un empleado no puede quedar con dos certificados vivos.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS certificado_dia_unico
      ON certificado_medico_dias (employee_id, fecha) WHERE NOT is_deleted;
  `);
}

const start = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB por foto
  await app.register(authRoutes);
  await app.register(accessRequestRoutes);
  await app.register(sectorRoutes);
  await app.register(employeeRoutes);
  await app.register(submissionRoutes);
  await app.register(absenceRoutes);
  await app.register(adminRoutes);
  await app.register(supervisorRoutes);
  await app.register(statsRoutes);
  await app.register(photoRoutes);
  await app.register(webAppRoutes);
  await app.register(adminWebRoutes);
  await app.register(certificadoRoutes);
  await app.register(pushRoutes);
  await app.register(fueraTerminoRoutes);

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
    // Con la base lista; si falla, el server sigue igual.
    await limpiarCertificadosHuerfanos(app.log).catch((e) => app.log.error(e, 'limpiar certificados huerfanos'));
  } else {
    console.error('DB no respondió tras los reintentos; el server queda arriba igual');
  }
};

start().catch(err => {
  console.error('Fallo al arrancar el server:', err);
  process.exit(1);
});
