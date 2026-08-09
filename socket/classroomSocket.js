const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const User = require('../models/User');
const Class = require('../models/Class');
const { assertLiveJoinAccess } = require('../utils/liveSession');

/** @type {Map<string, Map<string, ClassroomParticipant>>} */
const roomParticipants = new Map();

/**
 * @typedef {Object} ClassroomParticipant
 * @property {string} userId
 * @property {string} name
 * @property {'student'|'professor'|'admin'} role
 * @property {boolean} isHost
 * @property {boolean} mic
 * @property {boolean} cam
 * @property {boolean} handRaised
 * @property {string} joinedAt
 */

function roomKey(classId) {
  return `classroom:${classId}`;
}

function getRoomMap(classId) {
  const key = roomKey(classId);
  if (!roomParticipants.has(key)) {
    roomParticipants.set(key, new Map());
  }
  return roomParticipants.get(key);
}

function serializeParticipants(classId) {
  const map = getRoomMap(classId);
  return Array.from(map.values());
}

function broadcastParticipants(io, classId) {
  io.to(roomKey(classId)).emit('participants:sync', {
    participants: serializeParticipants(classId),
  });
}

function removeParticipant(io, classId, userId) {
  const map = getRoomMap(classId);
  if (!map.has(userId)) return false;
  map.delete(userId);
  if (map.size === 0) {
    roomParticipants.delete(roomKey(classId));
  }
  io.to(roomKey(classId)).emit('participant:left', { userId });
  broadcastParticipants(io, classId);
  return true;
}

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentification requise'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || user.status === 'suspended' || user.isLocked) {
      return next(new Error('Utilisateur non autorisé'));
    }
    socket.user = user;
    next();
  } catch {
    next(new Error('Token invalide ou expiré'));
  }
}

function attachClassroomSocket(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    /** @type {Set<string>} */
    const joinedClasses = new Set();

    socket.on('classroom:join', async ({ classId }, ack) => {
      try {
        if (!classId) {
          ack?.({ ok: false, error: 'classId requis' });
          return;
        }

        const classItem = await Class.findById(classId);
        if (!classItem) {
          ack?.({ ok: false, error: 'Session introuvable' });
          return;
        }

        const access = await assertLiveJoinAccess({ user: socket.user }, classItem);
        if (!access.ok) {
          ack?.({ ok: false, error: access.message || 'Accès refusé' });
          return;
        }

        const userId = socket.user._id.toString();
        const name = `${socket.user.firstName || ''} ${socket.user.lastName || ''}`.trim() || 'Participant';

        /** @type {ClassroomParticipant} */
        const participant = {
          userId,
          name,
          role: socket.user.role,
          isHost: access.isHost,
          mic: false,
          cam: false,
          handRaised: false,
          joinedAt: new Date().toISOString(),
        };

        getRoomMap(classId).set(userId, participant);
        joinedClasses.add(classId);
        socket.join(roomKey(classId));

        socket.to(roomKey(classId)).emit('participant:joined', { participant });
        broadcastParticipants(io, classId);

        ack?.({
          ok: true,
          participant,
          participants: serializeParticipants(classId),
        });
      } catch (err) {
        console.error('classroom:join error:', err);
        ack?.({ ok: false, error: 'Erreur serveur' });
      }
    });

    socket.on('classroom:leave', ({ classId }) => {
      if (!classId) return;
      const userId = socket.user._id.toString();
      removeParticipant(io, classId, userId);
      joinedClasses.delete(classId);
      socket.leave(roomKey(classId));
    });

    socket.on('presence:update', ({ classId, mic, cam }) => {
      if (!classId) return;
      const userId = socket.user._id.toString();
      const map = getRoomMap(classId);
      const p = map.get(userId);
      if (!p) return;
      if (typeof mic === 'boolean') p.mic = mic;
      if (typeof cam === 'boolean') p.cam = cam;
      io.to(roomKey(classId)).emit('presence:updated', {
        userId,
        mic: p.mic,
        cam: p.cam,
      });
    });

    socket.on('hand:raise', ({ classId, raised }) => {
      if (!classId) return;
      const userId = socket.user._id.toString();
      const map = getRoomMap(classId);
      const p = map.get(userId);
      if (!p) return;
      p.handRaised = Boolean(raised);
      io.to(roomKey(classId)).emit('hand:raised', {
        userId,
        raised: p.handRaised,
        name: p.name,
      });
      broadcastParticipants(io, classId);
    });

    socket.on('chat:send', ({ classId, text }) => {
      if (!classId) return;
      const trimmed = String(text || '').trim();
      if (!trimmed || trimmed.length > 2000) return;

      const userId = socket.user._id.toString();
      const map = getRoomMap(classId);
      if (!map.has(userId)) return;

      const p = map.get(userId);
      const message = {
        id: randomUUID(),
        userId,
        name: p.name,
        role: p.role,
        text: trimmed,
        at: new Date().toISOString(),
      };

      io.to(roomKey(classId)).emit('chat:message', message);
    });

    socket.on('disconnect', () => {
      for (const classId of joinedClasses) {
        removeParticipant(io, classId, socket.user._id.toString());
      }
      joinedClasses.clear();
    });
  });
}

module.exports = { attachClassroomSocket, roomParticipants };
