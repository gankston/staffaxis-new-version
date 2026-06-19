import { db } from '../db.js';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// Carpeta donde se guardan las fotos. En Railway se monta un Volume y se setea
// UPLOAD_DIR=/data. En local cae a ./uploads para poder probar sin volume.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const DNI_DIR = path.join(UPLOAD_DIR, 'dni');

// lado válido → columna de la DB
const COL = { frente: 'dni_foto_frente', dorso: 'dni_foto_dorso' };

// Acepta device JWT (app Android) o admin token (StaffAdmin). Igual que GET /api/employees.
function verifyDeviceOrAdmin(req, reply) {
  const adminToken = req.headers['x-admin-token'];
  if (adminToken) {
    if (adminToken !== process.env.ADMIN_TOKEN) {
      reply.status(401).send({ error: 'Token de administrador inválido' });
      return false;
    }
    return true;
  }
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'No autorizado' });
    return false;
  }
  try {
    jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return true;
  } catch {
    reply.status(401).send({ error: 'Token inválido o expirado' });
    return false;
  }
}

export async function photoRoutes(app) {

  // POST /api/employees/:id/foto/:lado — sube o reemplaza una cara del DNI (multipart)
  app.post('/api/employees/:id/foto/:lado', async (req, reply) => {
    if (!verifyDeviceOrAdmin(req, reply)) return;
    const { id, lado } = req.params;
    const col = COL[lado];
    if (!col) return reply.status(400).send({ error: 'lado debe ser frente o dorso' });

    const emp = await db.query('SELECT id FROM employees WHERE id = $1', [id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se recibió ninguna imagen' });

    await fsp.mkdir(DNI_DIR, { recursive: true });
    const fileName = `${id}_${lado}.jpg`;
    const dest = path.join(DNI_DIR, fileName);

    try {
      await pipeline(data.file, fs.createWriteStream(dest));
    } catch (err) {
      return reply.status(500).send({ error: 'Error al guardar la imagen' });
    }
    // Si el cliente excedió el límite de tamaño, multipart lo trunca y marca truncated
    if (data.file.truncated) {
      await fsp.unlink(dest).catch(() => {});
      return reply.status(413).send({ error: 'La imagen es demasiado grande' });
    }

    await db.query(`UPDATE employees SET ${col} = $1 WHERE id = $2`, [fileName, id]);
    return reply.send({ ok: true, lado });
  });

  // GET /api/employees/:id/foto/:lado — devuelve la imagen
  app.get('/api/employees/:id/foto/:lado', async (req, reply) => {
    if (!verifyDeviceOrAdmin(req, reply)) return;
    const { id, lado } = req.params;
    const col = COL[lado];
    if (!col) return reply.status(400).send({ error: 'lado debe ser frente o dorso' });

    const result = await db.query(`SELECT ${col} AS foto FROM employees WHERE id = $1`, [id]);
    const fileName = result.rows[0]?.foto;
    if (!fileName) return reply.status(404).send({ error: 'Sin foto cargada' });

    const filePath = path.join(DNI_DIR, fileName);
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'Archivo no encontrado' });

    return reply.type('image/jpeg').send(fs.createReadStream(filePath));
  });

  // DELETE /api/employees/:id/foto/:lado — elimina la foto
  app.delete('/api/employees/:id/foto/:lado', async (req, reply) => {
    if (!verifyDeviceOrAdmin(req, reply)) return;
    const { id, lado } = req.params;
    const col = COL[lado];
    if (!col) return reply.status(400).send({ error: 'lado debe ser frente o dorso' });

    const result = await db.query(`SELECT ${col} AS foto FROM employees WHERE id = $1`, [id]);
    const fileName = result.rows[0]?.foto;
    if (fileName) {
      await fsp.unlink(path.join(DNI_DIR, fileName)).catch(() => {});
    }
    await db.query(`UPDATE employees SET ${col} = NULL WHERE id = $1`, [id]);
    return reply.send({ ok: true, lado });
  });
}
