import { db } from '../db.js';
import { v4 as uuid } from 'uuid';
import { verifyDevice } from '../middleware/auth.js';

import { normalizarSeparadorDecimal, completarTipados } from '../lib/tarjaValores.js';

export async function submissionRoutes(app) {

  // POST /api/submissions
  app.post('/api/submissions', { preHandler: verifyDevice }, async (req, reply) => {
    const {
      employee_id, date, minutes_worked, notes, latitude, longitude,
      horas, cosecha, cajas, cajones, abonada, importe,
      km_viajes, has_fumigadas, siembra_trilla, bolseros, etiquetado,
      carga_camion_kg50, carga_camion_kg25, carga_camion_otro,
      movimiento_estiba_kg50, movimiento_estiba_kg25, movimiento_estiba_otro,
      // Etiquetado abierto por lata, y Descarga/Carga de FABRICA
      etiquetado_lata_185, etiquetado_lata_750, etiquetado_lata_2500, etiquetado_lata_8kg, descarga_jaula, descarga_camion, carga_jaula, carga_camion_cantidad,
      // Cosecha abierta por origen y Tantero. Estos NUNCA se escriben en
      // minutes_worked ni se leen de ahi: la columna es el dato.
      cosecha_canadas, cosecha_inv, cosecha_bananas, tantero_invernadero, tantero_campo,
    } = req.body ?? {};
    if (!employee_id || !date) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' });
    }

    const emp = await db.query(
      `SELECT e.sector_id, COALESCE(s.requiere_aprobacion, false) AS requiere_aprobacion
       FROM employees e LEFT JOIN sectors s ON s.id = e.sector_id
       WHERE e.id = $1`,
      [employee_id]
    );
    if (!emp.rows[0]) return reply.status(404).send({ error: 'Empleado no encontrado' });

    // La mayoria de los sectores siguen auto-aprobados como siempre. Solo los que
    // tienen requiere_aprobacion=true (hoy: sectores de pruebas) pasan por supervisor.
    const statusInicial = emp.rows[0].requiere_aprobacion ? 'pending' : 'approved';

    // Pedido de IT Salvita, puntos 1 y 2 del informe del 11/09.
    //
    // 1) Un solo separador decimal. El teclado numerico de Android en español
    //    escribe coma, y con los dos conviviendo ningun export sale derecho.
    //    Se guarda siempre con punto; los lectores aceptan las dos formas, asi
    //    que lo que ya esta cargado se sigue leyendo igual.
    const mw = normalizarSeparadorDecimal(minutes_worked ?? null);

    // 2) Que el numero llegue a la columna tipada aunque el telefono no la
    //    mande. Sin esto un reporte que lea solo las columnas sale corto y en
    //    silencio: hay 800 partes con las cajas unicamente en el texto, y las
    //    versiones viejas de la app no mandan ninguna de estas columnas.
    //    Lo que el cliente SI manda no se toca.
    // `importe` es el nombre viejo del campo: la abonada nunca fue plata, es una
    // cantidad como la cosecha. Se sigue aceptando porque los telefonos que todavia
    // no se actualizaron lo mandan asi.
    const tipados = completarTipados(mw, { horas, cosecha, cajas, cajones, abonada: abonada ?? importe });

    // La cosecha abierta manda: si vienen los subtipos, el total es la suma de
    // ELLOS, no lo que diga el texto. Asi la columna `cosecha` sigue sirviendo
    // para el MCP y el tablero, sin que nadie tenga que reparsear nada.
    const subtipos = [cosecha_canadas, cosecha_inv, cosecha_bananas].filter((v) => v !== undefined && v !== null);
    if (subtipos.length) tipados.cosecha = subtipos.reduce((a, b) => Number(a) + Number(b), 0);

    const id = uuid();
    await db.query(
      `INSERT INTO submissions (
         id, employee_id, sector_id, date, minutes_worked, notes, status, latitude, longitude,
         horas, cosecha, cajas, cajones, importe,
         km_viajes, has_fumigadas, siembra_trilla, bolseros, etiquetado,
         carga_camion_kg50, carga_camion_kg25, carga_camion_otro,
         movimiento_estiba_kg50, movimiento_estiba_kg25, movimiento_estiba_otro,
         etiquetado_lata_185, etiquetado_lata_750, etiquetado_lata_2500, etiquetado_lata_8kg, descarga_jaula, descarga_camion, carga_jaula, carga_camion_cantidad,
         cosecha_canadas, cosecha_inv, cosecha_bananas, tantero_invernadero, tantero_campo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
       ON CONFLICT (employee_id, date) WHERE NOT is_deleted
       DO UPDATE SET minutes_worked         = EXCLUDED.minutes_worked,
                     notes                  = EXCLUDED.notes,
                     latitude               = EXCLUDED.latitude,
                     longitude              = EXCLUDED.longitude,
                     horas                  = EXCLUDED.horas,
                     cosecha                = EXCLUDED.cosecha,
                     cajas                  = EXCLUDED.cajas,
                     cajones                = EXCLUDED.cajones,
                     importe                = EXCLUDED.importe,
                     km_viajes              = EXCLUDED.km_viajes,
                     has_fumigadas          = EXCLUDED.has_fumigadas,
                     siembra_trilla         = EXCLUDED.siembra_trilla,
                     bolseros               = EXCLUDED.bolseros,
                     etiquetado             = EXCLUDED.etiquetado,
                     carga_camion_kg50      = EXCLUDED.carga_camion_kg50,
                     carga_camion_kg25      = EXCLUDED.carga_camion_kg25,
                     carga_camion_otro      = EXCLUDED.carga_camion_otro,
                     movimiento_estiba_kg50 = EXCLUDED.movimiento_estiba_kg50,
                     movimiento_estiba_kg25 = EXCLUDED.movimiento_estiba_kg25,
                     movimiento_estiba_otro = EXCLUDED.movimiento_estiba_otro,
                     etiquetado_lata_185 = EXCLUDED.etiquetado_lata_185,
                     etiquetado_lata_750 = EXCLUDED.etiquetado_lata_750,
                     etiquetado_lata_2500 = EXCLUDED.etiquetado_lata_2500,
                     etiquetado_lata_8kg = EXCLUDED.etiquetado_lata_8kg,
                     descarga_jaula = EXCLUDED.descarga_jaula,
                     descarga_camion = EXCLUDED.descarga_camion,
                     carga_jaula = EXCLUDED.carga_jaula,
                     carga_camion_cantidad = EXCLUDED.carga_camion_cantidad,
                     cosecha_canadas = EXCLUDED.cosecha_canadas,
                     cosecha_inv = EXCLUDED.cosecha_inv,
                     cosecha_bananas = EXCLUDED.cosecha_bananas,
                     tantero_invernadero = EXCLUDED.tantero_invernadero,
                     tantero_campo = EXCLUDED.tantero_campo,
                     -- Al editar una tarja ya cargada vuelve a quedar como recien enviada:
                     -- si el sector requiere aprobacion pasa de nuevo a 'pending' y se borra
                     -- la aprobacion anterior, porque el supervisor aprobo OTROS valores y
                     -- tiene que poder revisar la modificacion.
                     status                 = EXCLUDED.status,
                     aprobada_por           = NULL,
                     aprobada_en            = NULL,
                     fue_editada            = true,
                     updated_at             = NOW()`,
      [
        id, employee_id, emp.rows[0].sector_id, date, mw, notes ?? null, statusInicial, latitude ?? null, longitude ?? null,
        tipados.horas, tipados.cosecha, tipados.cajas, tipados.cajones, tipados.abonada,
        km_viajes ?? null, has_fumigadas ?? null, siembra_trilla ?? null, bolseros ?? null, etiquetado ?? null,
        carga_camion_kg50 ?? null, carga_camion_kg25 ?? null, carga_camion_otro ?? null,
        movimiento_estiba_kg50 ?? null, movimiento_estiba_kg25 ?? null, movimiento_estiba_otro ?? null,
        etiquetado_lata_185 ?? null, etiquetado_lata_750 ?? null, etiquetado_lata_2500 ?? null, etiquetado_lata_8kg ?? null, descarga_jaula ?? null, descarga_camion ?? null, carga_jaula ?? null, carga_camion_cantidad ?? null,
        cosecha_canadas ?? null, cosecha_inv ?? null, cosecha_bananas ?? null, tantero_invernadero ?? null, tantero_campo ?? null,
      ]
    );

    const saved = await db.query(
      'SELECT id, status FROM submissions WHERE employee_id = $1 AND date = $2 AND NOT is_deleted',
      [employee_id, date]
    );
    return reply.send({ id: saved.rows[0].id, status: saved.rows[0].status });
  });

  // GET /api/submissions?start_date=&end_date=&employee_id=
  //
  // Mismas filas que /api/admin/report pero acotado al sector del dispositivo que
  // pregunta, sin admin token. La app Android no lo necesita porque lee su base
  // local (Room + outbox); el clon web no tiene base local, y la alternativa era
  // meter el admin token dentro del bundle de la pagina — o sea, regalarselo a
  // cualquiera que abra la URL.
  app.get('/api/submissions', { preHandler: verifyDevice }, async (req, reply) => {
    const { sectorId } = req.device;
    const { start_date, end_date, employee_id } = req.query ?? {};

    const params = [sectorId];
    let filtro = '';
    if (start_date && end_date) {
      params.push(start_date, end_date);
      filtro += ` AND s.date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (employee_id) {
      params.push(employee_id);
      filtro += ` AND s.employee_id = $${params.length}`;
    }

    const result = await db.query(
      `SELECT s.id AS submission_id, s.employee_id,
              e.first_name, e.last_name, e.dni,
              s.date, s.minutes_worked, s.notes, s.status,
              s.horas, s.cosecha, s.cajas, s.cajones, s.importe, s.importe AS abonada,
              s.km_viajes, s.has_fumigadas, s.siembra_trilla, s.bolseros, s.etiquetado,
              s.carga_camion_kg50, s.carga_camion_kg25, s.carga_camion_otro,
              s.movimiento_estiba_kg50, s.movimiento_estiba_kg25, s.movimiento_estiba_otro,
              s.etiquetado_lata_185, s.etiquetado_lata_750, s.etiquetado_lata_2500, s.etiquetado_lata_8kg,
              s.cosecha_canadas, s.cosecha_inv, s.cosecha_bananas, s.tantero_invernadero, s.tantero_campo, s.descarga_jaula, s.descarga_camion, s.carga_jaula, s.carga_camion_cantidad,
              s.motivo_rechazo
       FROM submissions s
       JOIN employees e ON e.id = s.employee_id
       WHERE s.sector_id = $1
         AND NOT s.is_deleted${filtro}
       ORDER BY e.last_name, e.first_name, s.date`,
      params
    );
    return reply.send({ rows: result.rows });
  });

  // GET /api/rechazadas — tarjas que el supervisor rechazo en el sector de este
  // dispositivo y todavia no se corrigieron, para avisarle al que las cargo.
  app.get('/api/rechazadas', { preHandler: verifyDevice }, async (req, reply) => {
    const { sectorId } = req.device;
    const r = await db.query(
      `SELECT s.id, s.date, s.minutes_worked, s.motivo_rechazo, s.aprobada_en,
              e.first_name, e.last_name, sup.full_name AS rechazada_por
       FROM submissions s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN supervisors sup ON sup.id = s.aprobada_por
       WHERE s.sector_id = $1 AND s.status = 'rejected' AND NOT s.is_deleted
       ORDER BY s.date DESC, e.last_name`,
      [sectorId]
    );
    return reply.send({
      items: r.rows.map(x => ({
        id: x.id,
        empleado: `${x.last_name ?? ''} ${x.first_name ?? ''}`.trim(),
        date: x.date,
        minutesWorked: x.minutes_worked,
        motivo: x.motivo_rechazo,
        rechazadaPor: x.rechazada_por,
      })),
    });
  });

  // GET /api/approved?since=<epoch_ms>&since_id=<uuid>&limit=<n>
  app.get('/api/approved', { preHandler: verifyDevice }, async (req, reply) => {
    const since   = parseInt(req.query.since   ?? '0', 10);
    const sinceId = req.query.since_id ?? null;
    const limit   = Math.min(parseInt(req.query.limit ?? '500', 10), 1000);
    const { sectorId } = req.device;

    const sinceTs = new Date(since).toISOString();

    let result;
    if (sinceId) {
      result = await db.query(
        `SELECT id, employee_id, sector_id, date, minutes_worked, notes,
                (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT AS updated_at_ms,
                is_deleted
         FROM submissions
         WHERE sector_id = $1
           AND (updated_at > $2 OR (updated_at = $2 AND id > $3))
         ORDER BY updated_at, id
         LIMIT $4`,
        [sectorId, sinceTs, sinceId, limit + 1]
      );
    } else {
      result = await db.query(
        `SELECT id, employee_id, sector_id, date, minutes_worked, notes,
                (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT AS updated_at_ms,
                is_deleted
         FROM submissions
         WHERE sector_id = $1 AND updated_at > $2
         ORDER BY updated_at, id
         LIMIT $3`,
        [sectorId, sinceTs, limit + 1]
      );
    }

    const hasMore = result.rows.length > limit;
    const items   = result.rows.slice(0, limit);
    const lastId  = items.length > 0 ? items[items.length - 1].id : null;

    return reply.send({
      items: items.map(r => ({
        id:            r.id,
        employeeId:    r.employee_id,
        sectorId:      r.sector_id,
        date:          r.date,
        minutesWorked: r.minutes_worked,
        notes:         r.notes,
        updatedAt:     Number(r.updated_at_ms),
        isDeleted:     r.is_deleted,
      })),
      hasMore,
      lastId,
    });
  });
}
