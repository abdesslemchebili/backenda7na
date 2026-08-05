const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet());

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

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  const allowed = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, ...DEV_ORIGINS]
    : DEV_ORIGINS;
  const isLocalDev =
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (allowed.includes(origin) || isLocalDev) {
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

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
