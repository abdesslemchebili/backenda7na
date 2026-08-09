const rateLimit = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

function isRateLimitDisabled() {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return true;
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test';
}

function getWindowMs() {
  const parsed = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_MS;
}

function getApiMax() {
  const parsed = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

function getAuthMax() {
  const parsed = parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

function getRefreshMax() {
  const parsed = parseInt(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

/** Per-user when Bearer token present; otherwise client IP (requires trust proxy on Render). */
function rateLimitKey(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return `user-token:${auth.slice(7, 64)}`;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function skipPublicPaths(req) {
  const url = req.originalUrl || req.url || '';
  return url.startsWith('/api/health') || url.startsWith('/socket.io');
}

function createNoopLimiter() {
  return (_req, _res, next) => next();
}

function createApiLimiter() {
  if (isRateLimitDisabled()) return createNoopLimiter();

  return rateLimit({
    windowMs: getWindowMs(),
    max: getApiMax(),
    standardHeaders: true,
    legacyHeaders: true,
    keyGenerator: rateLimitKey,
    skip: skipPublicPaths,
    message: {
      error: 'Too many requests',
      message: 'Too many requests. Please wait a moment and try again.',
    },
  });
}

function createAuthLimiter(max = getAuthMax()) {
  if (isRateLimitDisabled()) return createNoopLimiter();

  return rateLimit({
    windowMs: getWindowMs(),
    max,
    standardHeaders: true,
    legacyHeaders: true,
    keyGenerator: rateLimitKey,
    message: {
      error: 'Too many requests',
      message: 'Too many authentication attempts. Please try again later.',
    },
  });
}

module.exports = {
  createApiLimiter,
  createAuthLimiter,
  isRateLimitDisabled,
};
