import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

/**
 * Sirve el clon web de la app (lo que carga el WebView del shell de Android)
 * bajo /app, desde server/public.
 *
 * El caché es lo que hace que "actualizar sin actualizar la app" funcione de
 * verdad, asi que va explicito:
 *   - los assets llevan hash en el nombre  -> cache eterna, nunca cambian
 *   - index.html                           -> no-cache, se revalida en cada
 *     arranque, y de ahi salen los nombres nuevos de los assets
 *
 * A proposito NO hay service worker: es justamente lo que provoca quedarse con
 * una version vieja pegada sin forma facil de invalidarla.
 */
export async function webAppRoutes(app) {
  if (!fs.existsSync(PUBLIC_DIR)) {
    app.log.warn(`webApp: no existe ${PUBLIC_DIR}, no se sirve /app`);
    return;
  }

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: '/app/',
    index: false,
    setHeaders(res, ruta) {
      if (ruta.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  });

  const enviarIndex = (_req, reply) =>
    reply
      .header('Cache-Control', 'no-cache, must-revalidate')
      .type('text/html; charset=utf-8')
      .send(fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')));

  // Sin fallback de SPA a proposito: la app navega por estado, no por URL, asi
  // que las unicas entradas son /app y /app/. Un setNotFoundHandler a nivel raiz
  // cambiaria la forma del 404 de TODA la API, y la app Android ya esta en la
  // calle esperando el 404 por defecto de Fastify.
  app.get('/app', enviarIndex);
  app.get('/app/', enviarIndex);
}

const ADMIN_DIR = path.join(__dirname, '..', '..', 'public-admin');

// El panel no se puede meter en un iframe de otra pagina (clickjacking: hacerle
// tocar "Borrar" a un admin logueado sin que se de cuenta).
const HEADERS_SEGURIDAD_ADMIN = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Version web de StaffAdmin bajo /admin, desde server/public-admin (lo genera
 * `npm run build:web` en el repo de StaffAdmin). Va en otra carpeta porque el
 * build de web/ vacia server/public entero.
 *
 * Mismo esquema de cache que /app: assets con hash eternos, index.html siempre
 * revalidado, asi cada deploy le llega a todos sin instalar nada.
 */
export async function adminWebRoutes(app) {
  if (!fs.existsSync(ADMIN_DIR)) {
    app.log.warn(`adminWeb: no existe ${ADMIN_DIR}, no se sirve /admin`);
    return;
  }

  await app.register(fastifyStatic, {
    root: ADMIN_DIR,
    prefix: '/admin/',
    index: false,
    // El sendFile ya lo agrega el registro de /app; no hace falta otra vez.
    decorateReply: false,
    setHeaders(res, ruta) {
      for (const [k, v] of Object.entries(HEADERS_SEGURIDAD_ADMIN)) res.setHeader(k, v);
      if (ruta.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  });

  // Sin la barra final, las imagenes "./logo.png" del panel se pedirian a la raiz.
  app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
  app.get('/admin/', (_req, reply) =>
    reply
      .headers(HEADERS_SEGURIDAD_ADMIN)
      .header('Cache-Control', 'no-cache, must-revalidate')
      .type('text/html; charset=utf-8')
      .send(fs.createReadStream(path.join(ADMIN_DIR, 'index.html'))));
}
