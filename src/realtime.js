import { Server } from 'socket.io';
import { db } from './db.js';
import { bus } from './bus.js';
import { parseCookies, userFromToken } from './auth.js';
import { conversationView, getMessage, listUsers } from './services.js';
import { wa } from './whatsapp.js';

/**
 * Regra de visibilidade em tempo real:
 *  - administradores recebem tudo (sala "admins");
 *  - atendentes recebem somente o que pertence às conversas atribuídas a eles (sala "user:<id>").
 * Quando uma conversa é transferida, o antigo responsável recebe "conversation:removed" e
 * nunca mais recebe eventos dela, porque a sala é calculada pelo dono ATUAL.
 */
export function setupRealtime(httpServer) {
  const io = new Server(httpServer);

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== socket.handshake.headers.host) return next(new Error('origem inválida'));
      } catch { return next(new Error('origem inválida')); }
    }
    const token = parseCookies(socket.handshake.headers.cookie).sid;
    const user = userFromToken(token);
    if (!user) return next(new Error('não autenticado'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const u = socket.data.user;
    socket.join(`user:${u.id}`);
    if (u.role === 'admin') socket.join('admins');
  });

  const ownerOf = (conversationId) =>
    db.prepare('SELECT assigned_to FROM conversations WHERE id=?').get(conversationId)?.assigned_to ?? null;

  const audience = (conversationId) => {
    const owner = ownerOf(conversationId);
    let target = io.to('admins');
    if (owner) target = target.to(`user:${owner}`);
    return target;
  };

  bus.on('conversation:update', (id) => {
    const view = conversationView(id);
    if (view) audience(id).emit('conversation:update', view);
  });

  bus.on('message:new', (message) => audience(message.conversation_id).emit('message:new', message));
  bus.on('message:update', (message) => audience(message.conversation_id).emit('message:update', message));

  bus.on('conversation:transferred', ({ conversationId, fromId, toName }) => {
    if (fromId) io.to(`user:${fromId}`).emit('conversation:removed', { id: conversationId, to_name: toName });
  });

  bus.on('users:changed', () => io.emit('users:changed', listUsers().map(({ email, ...rest }) => rest)));
  bus.on('users:disconnect', (userId) => io.in(`user:${userId}`).disconnectSockets(true));

  wa.on('state', (state) => {
    io.emit('wa:status', state);
    io.to('admins').emit('wa:qr', { qr: wa.qr });
  });

  return io;
}
