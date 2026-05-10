import jwt from 'jsonwebtoken';

export async function verifyDevice(request, reply) {
  const auth = request.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    request.device = payload;
  } catch {
    return reply.status(401).send({ error: 'Token inválido o expirado' });
  }
}

export async function verifyAdmin(request, reply) {
  const token = request.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return reply.status(401).send({ error: 'Acceso de administrador requerido' });
  }
}
