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
async function verifyDeviceOrAdmin(req, reply) {
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
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    reply.status(401).send({ error: 'Token inválido o expirado' });
    return false;
  }
  try {
    const r = await db.query('SELECT revoked FROM devices WHERE device_id = $1', [payload.deviceId]);
    if (r.rows[0]?.revoked) {
      reply.status(403).send({ error: 'Dispositivo revocado', revoked: true });
      return false;
    }
  } catch (err) {
    req.log?.error?.('verifyDeviceOrAdmin: fallo chequeo de revocacion: ' + err.message);
  }
  return true;
}

// Mira los primeros bytes, no la extension ni el Content-Type (que manda el
// cliente): JPEG, PNG o WebP. La app y StaffAdmin mandan JPEG.
async function esImagen(ruta) {
  const fh = await fsp.open(ruta, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(12), 0, 12, 0);
    if (bytesRead < 12) return false;
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
    return jpeg || png || webp;
  } finally {
    await fh.close();
  }
}

export async function photoRoutes(app) {

  // POST /api/employees/:id/foto/:lado — sube o reemplaza una cara del DNI (multipart)
  app.post('/api/employees/:id/foto/:lado', async (req, reply) => {
    if (!(await verifyDeviceOrAdmin(req, reply))) return;
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
    // Se escribe aparte y recien al final reemplaza a la foto anterior: antes se
    // escribia directo encima, y si la nueva venia muy grande o no era una foto,
    // la ficha se quedaba sin ninguna de las dos.
    const tmp = `${dest}.${process.pid}-${Date.now()}.tmp`;

    try {
      await pipeline(data.file, fs.createWriteStream(tmp));
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      return reply.status(500).send({ error: 'Error al guardar la imagen' });
    }
    // Si el cliente excedió el límite de tamaño, multipart lo trunca y marca truncated
    if (data.file.truncated) {
      await fsp.unlink(tmp).catch(() => {});
      return reply.status(413).send({ error: 'La imagen es demasiado grande' });
    }
    if (!(await esImagen(tmp))) {
      await fsp.unlink(tmp).catch(() => {});
      return reply.status(415).send({ error: 'El archivo no es una foto (tiene que ser JPG o PNG)' });
    }
    try {
      await fsp.rename(tmp, dest);
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      return reply.status(500).send({ error: 'Error al guardar la imagen' });
    }

    await db.query(`UPDATE employees SET ${col} = $1 WHERE id = $2`, [fileName, id]);
    return reply.send({ ok: true, lado });
  });

  // GET /api/employees/:id/foto/:lado — devuelve la imagen
  app.get('/api/employees/:id/foto/:lado', async (req, reply) => {
    if (!(await verifyDeviceOrAdmin(req, reply))) return;
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
    if (!(await verifyDeviceOrAdmin(req, reply))) return;
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
