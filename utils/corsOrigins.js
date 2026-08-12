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

function parseOriginList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => normalizeOriginUrl(part))
    .filter(Boolean);
}

/**
 * Allowed browser origins for CORS.
 * - FRONTEND_URL / APP_URL: primary site(s)
 * - CORS_ORIGINS: comma-separated extras (e.g. custom domain + www + http/https)
 */
function getAllowedOrigins() {
  const fromEnv = [
    ...parseOriginList(process.env.FRONTEND_URL),
    ...parseOriginList(process.env.APP_URL),
    ...parseOriginList(process.env.CORS_ORIGINS),
  ];
  return [...new Set([...fromEnv, ...DEV_ORIGINS])];
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
  parseOriginList,
  getAllowedOrigins,
  isOriginAllowed,
};
