const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { createApiLimiter } = require('./utils/rateLimit');
const { getAllowedOrigins, isOriginAllowed } = require('./utils/corsOrigins');

// Enregistrer les schémas avant toute requête (populate cross-models)
require('./models/registerSchemas');

const {
  authenticateToken,
  authorizeRoles,
} = require('./middleware/auth');
const { getScheduleConflicts } = require('./controllers/classController');

const app = express();

// Required on Render/Heroku so req.ip is the client, not the load balancer
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(helmet());

const corsOrigin = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  callback(new Error(`CORS blocked for origin: ${origin}`));
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.get('/api/health', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const payload = {
    status: dbReady ? 'ok' : 'degraded',
    db: dbReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };
  res.status(dbReady ? 200 : 503).json(payload);
});

// LiveKit webhooks need the raw body for signature verification (before JSON parser / rate limit)
app.use(
  '/api/webhooks/livekit',
  express.raw({ type: ['application/webhook+json', 'application/json', '*/*'], limit: '2mb' }),
  require('./routes/livekitWebhook')
);

const limiter = createApiLimiter();
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Route statique enregistrée sur l'app (prioritaire sur /api/classes/:id)
app.get(
  '/api/classes/schedule-conflicts',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  getScheduleConflicts
);

app.use('/api/files', require('./routes/files'));
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
app.use('/api/enrollment-requests', require('./routes/enrollmentRequests'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/placement-tests', require('./routes/placementTests'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/teacher-earnings', require('./routes/teacherEarnings'));
app.use('/api/languages', require('./routes/languages'));
app.use('/api/levels', require('./routes/levels'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/books', require('./routes/books'));
app.use('/api/chapters', require('./routes/chapters'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/games', require('./routes/games'));
app.use('/api/gamification', require('./routes/gamification'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/practice', require('./routes/practice'));

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(
      JSON.stringify({
        level: 'error',
        status,
        method: req.method,
        path: req.originalUrl,
        message: err.message,
        userId: req.user?._id?.toString?.() || null,
        timestamp: new Date().toISOString(),
      })
    );
  } else if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(status).json({
    error: err.name || 'Error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
