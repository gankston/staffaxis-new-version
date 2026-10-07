import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { verifyAdmin } from '../middleware/auth.js';

// Certificados medicos. Se cargan desde StaffAdmin: un archivo (foto o PDF) y
// los dias que cubre. En la base quedan SOLO los dias; las horas que suma cada
// dia (8 de lunes a viernes, 4 el sabado) las calcula el Excel, asi la regla
// vive en un solo lugar.
//
// El archivo va al Railway Volume, igual que las fotos del DNI: nunca a la base.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const CERT_DIR = path.join(UPLOAD_DIR, 'certificados');

// Un PDF escaneado pesa bastante mas que una foto de DNI.
const TOPE_BYTES = 15 * 1024 * 1024;

const TIPOS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Un id que no es UUID hace fallar la consulta en Postgres (500): se frena antes.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fechaReal = (s) => {
  if (!FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

const SELECT_CERTIFICADOS = `
  SELECT c.id, c.employee_id, c.tipo_archivo, c.nombre_original, c.observaciones, c.created_at,
         array_agg(to_char(d.fecha, 'YYYY-MM-DD') ORDER BY d.fecha) AS fechas
  FROM certificados_medicos c
  JOIN certificado_medico_dias d ON d.certificado_id = c.id AND NOT d.is_deleted
  JOIN employees e ON e.id = c.employee_id
  WHERE NOT c.is_deleted`;

/**
 * Borra los archivos de certificados que ya no tienen fila en la base (por
 * ejemplo, de un empleado borrado antes de que DELETE empleado limpiara sus
 * archivos). Corre una vez al arrancar el server.
 *
 * Solo toca nombres con la forma exacta `<uuid>.<pdf|jpg|jpeg|png>` y con mas
 * de 10 minutos: nada que no sea un certificado ni una subida en curso.
 */
export async function limpiarCertificadosHuerfanos(log) {
  let nombres;
  try {
    nombres = await fsp.readdir(CERT_DIR);
  } catch {
    return; // todavia no hay carpeta
  }
  const candidatos = nombres.filter((n) => /^[0-9a-f-]{36}\.(pdf|jpe?g|png)$/i.test(n));
  if (!candidatos.length) return;
  const { rows } = await db.query('SELECT archivo FROM certificados_medicos WHERE archivo = ANY($1)', [candidatos]);
  const conFila = new Set(rows.map((r) => r.archivo));
  let borrados = 0;
  for (const n of candidatos) {
    if (conFila.has(n)) continue;
    const ruta = path.join(CERT_DIR, n);
    const st = await fsp.stat(ruta).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < 10 * 60_000) continue;
    await fsp.unlink(ruta).then(() => borrados++).catch(() => {});
  }
  if (borrados) log.info(`certificados: ${borrados} archivo(s) sin certificado en la base, borrados`);
}

export async function certificadoRoutes(app) {

  // POST /api/admin/certificados?employee_id=X&fechas=2026-10-01,2026-10-02&observaciones=...
  // Cuerpo: multipart con el archivo. Los datos van en la URL para no depender
  // del orden de los campos dentro del multipart.
  app.post('/api/admin/certificados', { preHandler: verifyAdmin }, async (req, reply) => {
    const { employee_id, fechas: fechasTxt, observaciones } = req.query ?? {};
    if (!employee_id) return reply.status(400).send({ error: 'Falta el empleado' });
    if (!UUID.test(employee_id)) return reply.status(404).send({ error: 'Empleado no encontrado' });
    if (!req.isMultipart()) return reply.status(400).send({ error: 'Falta el archivo del certificado' });

    const fechas = [...new Set(String(fechasTxt ?? '').split(',').map((s) => s.trim()).filter(Boolean))].sort();
    if (!fechas.length) return reply.status(400).send({ error: 'Elegí al menos un día' });
    if (fechas.length > 92) return reply.status(400).send({ error: 'Son demasiados días para un solo certificado' });
    const malas = fechas.filter((f) => !fechaReal(f));
    if (malas.length) return reply.status(400).send({ error: `Fecha inválida: ${malas.join(', ')}` });

    const emp = await db.query('SELECT id FROM employees WHERE id = $1', [employee_id]);
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    // Un dia no puede tener dos certificados: se avisa cuales y no se guarda nada.
    const ocupados = await db.query(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM certificado_medico_dias
       WHERE employee_id = $1 AND fecha = ANY($2::date[]) AND NOT is_deleted ORDER BY fecha`,
      [employee_id, fechas]
    );
    if (ocupados.rows.length) {
      return reply.status(409).send({
        error: 'Esos días ya tienen certificado',
        code: 'DIAS_CON_CERTIFICADO',
        fechas: ocupados.rows.map((r) => r.fecha),
      });
    }

    const data = await req.file({ limits: { fileSize: TOPE_BYTES } });
    if (!data) return reply.status(400).send({ error: 'Falta el archivo del certificado' });
    const ext = TIPOS[data.mimetype];
    if (!ext) {
      data.file.resume();
      return reply.status(400).send({ error: 'El certificado tiene que ser una foto (JPG o PNG) o un PDF' });
    }

    const id = uuid();
    const archivo = `${id}.${ext}`;
    const destino = path.join(CERT_DIR, archivo);
    await fsp.mkdir(CERT_DIR, { recursive: true });
    try {
      await pipeline(data.file, fs.createWriteStream(destino));
    } catch {
      await fsp.unlink(destino).catch(() => {});
      return reply.status(500).send({ error: 'No se pudo guardar el archivo' });
    }
    if (data.file.truncated) {
      await fsp.unlink(destino).catch(() => {});
      return reply.status(413).send({ error: 'El archivo pesa más de 15 MB' });
    }

    const cliente = await db.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(
        `INSERT INTO certificados_medicos (id, employee_id, archivo, tipo_archivo, nombre_original, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, employee_id, archivo, data.mimetype, data.filename ?? null, observaciones?.trim() || null]
      );
      await cliente.query(
        `INSERT INTO certificado_medico_dias (certificado_id, employee_id, fecha)
         SELECT $1, $2, unnest($3::date[])`,
        [id, employee_id, fechas]
      );
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK').catch(() => {});
      await fsp.unlink(destino).catch(() => {});
      // Dos cargas a la vez del mismo dia: el indice unico frena la segunda.
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Esos días ya tienen certificado', code: 'DIAS_CON_CERTIFICADO' });
      }
      req.log.error(err);
      return reply.status(500).send({ error: 'No se pudo guardar el certificado' });
    } finally {
      cliente.release();
    }

    return reply.status(201).send({ id, employee_id, fechas, tipo_archivo: data.mimetype, nombre_original: data.filename ?? null });
  });

  // GET /api/admin/certificados?sector_id=X&start_date=Y&end_date=Z   (vista previa y Excel)
  // GET /api/admin/certificados?employee_id=X                          (los de un empleado)
  // Con rango, cada certificado trae solo los dias que caen adentro.
  app.get('/api/admin/certificados', { preHandler: verifyAdmin }, async (req, reply) => {
    const { sector_id, employee_id, start_date, end_date } = req.query ?? {};
    if (!sector_id && !employee_id) return reply.status(400).send({ error: 'Falta sector_id o employee_id' });
    if ((sector_id && !UUID.test(sector_id)) || (employee_id && !UUID.test(employee_id))) {
      return reply.status(400).send({ error: 'sector_id o employee_id inválido' });
    }
    if ((start_date && !fechaReal(start_date)) || (end_date && !fechaReal(end_date))) {
      return reply.status(400).send({ error: 'Rango de fechas inválido' });
    }

    const params = [];
    let sql = SELECT_CERTIFICADOS;
    if (sector_id)   { params.push(sector_id);   sql += ` AND e.sector_id = $${params.length}`; }
    if (employee_id) { params.push(employee_id); sql += ` AND c.employee_id = $${params.length}`; }
    if (start_date)  { params.push(start_date);  sql += ` AND d.fecha >= $${params.length}`; }
    if (end_date)    { params.push(end_date);    sql += ` AND d.fecha <= $${params.length}`; }
    sql += ' GROUP BY c.id ORDER BY min(d.fecha) DESC';

    const r = await db.query(sql, params);
    return reply.send({ certificados: r.rows });
  });

  // GET /api/admin/certificados/:id/archivo — la foto o el PDF
  app.get('/api/admin/certificados/:id/archivo', { preHandler: verifyAdmin }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.status(404).send({ error: 'Certificado no encontrado' });
    // Uno borrado ya no se muestra en ningun lado: tampoco se baja.
    const r = await db.query(
      'SELECT archivo, tipo_archivo, nombre_original FROM certificados_medicos WHERE id = $1 AND NOT is_deleted',
      [req.params.id]
    );
    const c = r.rows[0];
    if (!c) return reply.status(404).send({ error: 'Certificado no encontrado' });
    const ruta = path.join(CERT_DIR, c.archivo);
    if (!fs.existsSync(ruta)) return reply.status(404).send({ error: 'Archivo no encontrado' });
    return reply.type(c.tipo_archivo).send(fs.createReadStream(ruta));
  });

  // DELETE /api/admin/certificados/:id — borrado logico, como las tarjas: los
  // dias vuelven a mostrar lo que tenian cargado, y se puede deshacer.
  app.delete('/api/admin/certificados/:id', { preHandler: verifyAdmin }, async (req, reply) => {
    const { id } = req.params;
    if (!UUID.test(id)) return reply.status(404).send({ error: 'Certificado no encontrado' });
    const r = await db.query(
      'UPDATE certificados_medicos SET is_deleted = true WHERE id = $1 AND NOT is_deleted RETURNING id',
      [id]
    );
    if (!r.rows[0]) return reply.status(404).send({ error: 'Certificado no encontrado' });
    await db.query('UPDATE certificado_medico_dias SET is_deleted = true WHERE certificado_id = $1', [id]);
    return reply.send({ ok: true });
  });
}
