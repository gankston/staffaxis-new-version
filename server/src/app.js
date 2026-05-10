import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { authRoutes }       from './routes/auth.js';
import { sectorRoutes }     from './routes/sectors.js';
import { employeeRoutes }   from './routes/employees.js';
import { submissionRoutes } from './routes/submissions.js';
import { absenceRoutes }    from './routes/absences.js';
import { adminRoutes }      from './routes/admin.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.register(authRoutes);
app.register(sectorRoutes);
app.register(employeeRoutes);
app.register(submissionRoutes);
app.register(absenceRoutes);
app.register(adminRoutes);

app.get('/health', async () => ({ ok: true }));

const port = parseInt(process.env.PORT ?? '3000', 10);
try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
