/**
 * Notificaciones al telefono (las que suenan con la app cerrada, como WhatsApp)
 * por Firebase Cloud Messaging, API HTTP v1.
 *
 * La clave de la cuenta de servicio de Firebase (proyecto staffaxis-bfd61) va en
 * la variable FCM_SERVICE_ACCOUNT de Railway, el JSON entero (o en base64). NUNCA
 * en el repo: es publico y Google da de baja las claves que encuentra ahi.
 *
 * Sin dependencias nuevas: el token de acceso se firma con jsonwebtoken (RS256)
 * y se cambia en oauth2.googleapis.com, que es lo mismo que hace firebase-admin.
 */
import jwt from 'jsonwebtoken';
import { db } from '../db.js';

let cuenta = null;
function cuentaDeServicio() {
  if (cuenta) return cuenta;
  const crudo = process.env.FCM_SERVICE_ACCOUNT;
  if (!crudo) return null;
  try {
    const texto = crudo.trim().startsWith('{') ? crudo : Buffer.from(crudo, 'base64').toString('utf8');
    cuenta = JSON.parse(texto);
    return cuenta;
  } catch {
    return null;
  }
}

export const pushConfigurado = () => !!cuentaDeServicio();

// El token de Google dura una hora; se reusa hasta 5 minutos antes de vencer.
let acceso = { token: null, vence: 0 };
async function tokenDeAcceso() {
  if (acceso.token && Date.now() < acceso.vence - 5 * 60_000) return acceso.token;
  const c = cuentaDeServicio();
  if (!c) throw new Error('Falta FCM_SERVICE_ACCOUNT');
  const ahora = Math.floor(Date.now() / 1000);
  const firmado = jwt.sign(
    {
      iss: c.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    },
    c.private_key,
    { algorithm: 'RS256' }
  );
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: firmado }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google no dio token de acceso: ' + (j.error_description || j.error || r.status));
  acceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return acceso.token;
}

/**
 * Manda una notificacion a una lista de tokens. Devuelve cuantas salieron.
 * Los tokens que Firebase dice que ya no existen (desinstalaron la app, por
 * ejemplo) se sacan de la tabla para no seguir intentando.
 *
 * `data` viaja junto a la notificacion (solo strings): la app la usa para saber
 * a que pantalla ir cuando la tocan.
 */
export async function mandarPush(tokens, { titulo, cuerpo, data = {} }) {
  const unicos = [...new Set(tokens.filter(Boolean))];
  if (!unicos.length) return { enviadas: 0, fallidas: 0 };
  const c = cuentaDeServicio();
  if (!c) throw new Error('Las notificaciones no estan configuradas (falta FCM_SERVICE_ACCOUNT)');
  const bearer = await tokenDeAcceso();
  const url = `https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`;
  const datos = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  let enviadas = 0;
  let fallidas = 0;
  const muertos = [];
  await Promise.all(
    unicos.map(async (token) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: titulo, body: cuerpo },
              data: datos,
              android: {
                // "high": que despierte al telefono aunque este en reposo, como un
                // mensaje de WhatsApp. El canal lo crea la app con sonido y vibracion.
                priority: 'high',
                notification: { channel_id: 'avisos', sound: 'default' },
              },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) {
          enviadas++;
          return;
        }
        fallidas++;
        const j = await r.json().catch(() => ({}));
        const codigo = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode ?? j?.error?.status;
        if (r.status === 404 || codigo === 'UNREGISTERED' || codigo === 'INVALID_ARGUMENT') muertos.push(token);
      } catch {
        fallidas++;
      }
    })
  );
  if (muertos.length) {
    await db.query('DELETE FROM push_tokens WHERE token = ANY($1)', [muertos]).catch(() => {});
  }
  return { enviadas, fallidas };
}

/** Tokens de los telefonos de un sector (encargados). */
export async function tokensDeSector(sectorId) {
  const r = await db.query('SELECT token FROM push_tokens WHERE sector_id = $1', [sectorId]);
  return r.rows.map((x) => x.token);
}

/** Tokens de uno o varios device_id. */
export async function tokensDeDispositivos(deviceIds) {
  const r = await db.query('SELECT token FROM push_tokens WHERE device_id = ANY($1)', [deviceIds]);
  return r.rows.map((x) => x.token);
}
