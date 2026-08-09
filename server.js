const http = require('http');
require('dotenv').config();
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const app = require('./app');
const { attachClassroomSocket } = require('./socket/classroomSocket');

const DEV_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === 'production'
      ? null
      : 'mongodb://localhost:27017/language_school');

  if (!uri) {
    console.error(
      '❌ MONGODB_URI (ou DATABASE_URL) est requis en production. ' +
        'Ajoutez-le dans les Environment Variables de Render / votre hébergeur.'
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connexion à MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error.message);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);
  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, ...DEV_ORIGINS]
    : DEV_ORIGINS;

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isLocalDev =
          process.env.NODE_ENV !== 'production' &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (allowedOrigins.includes(origin) || isLocalDev) {
          return callback(null, true);
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
    path: '/socket.io',
  });

  attachClassroomSocket(io);

  server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log('📚 Plateforme Nour Academy');
    console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔌 Socket.io classroom actif');
  });

  return { server, io };
};

if (require.main === module) {
  startServer();
}

module.exports = { app, connectDB, startServer };
