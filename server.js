const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Configuration des middlewares de sécurité
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting (returns 429 when exceeded; standard headers for frontend)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,  // RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
  legacyHeaders: true,   // X-RateLimit-*
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads (for document/image URLs)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api', require('./routes/documents'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/class-groups', require('./routes/classGroups'));
app.use('/api/leads', require('./routes/leads'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.name || 'Error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Connexion à MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/language_school'
    );
    console.log('✅ Connexion à MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error.message);
    process.exit(1);
  }
};

// Démarrage du serveur
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📚 Plateforme d'école de langues en ligne`);
    console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer();

module.exports = app; 