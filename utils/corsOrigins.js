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

function normalizeOriginUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
  return `https://${trimmed.replace(/\/$/, '')}`;
}

function getAllowedOrigins() {
  const frontend = normalizeOriginUrl(process.env.FRONTEND_URL);
  return frontend ? [frontend, ...DEV_ORIGINS] : [...DEV_ORIGINS];
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  const isLocalDev =
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return isLocalDev || getAllowedOrigins().includes(origin);
}

module.exports = {
  DEV_ORIGINS,
  normalizeOriginUrl,
  getAllowedOrigins,
  isOriginAllowed,
};
