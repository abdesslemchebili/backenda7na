const jwt = require('jsonwebtoken');
const path = require('path');

const DEFAULT_TTL = '1h';

/**
 * Extract a safe path under uploads/ from a stored URL or relative path.
 * @returns {string|null} e.g. "uploads/documents/123.pdf"
 */
function normalizeStoredPath(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return null;
  const trimmed = storedUrl.trim();
  const match = trimmed.match(/\/uploads\/(.+)$/);
  if (match) return `uploads/${match[1]}`;
  if (trimmed.startsWith('uploads/')) return trimmed;
  return null;
}

/**
 * Resolve filesystem path and ensure it stays inside uploads/.
 */
function getAbsoluteFilePath(normalizedPath) {
  if (!normalizedPath) return null;
  const base = path.join(__dirname, '..');
  const resolved = path.resolve(base, normalizedPath);
  const uploadsRoot = path.resolve(base, 'uploads');
  if (!resolved.startsWith(uploadsRoot + path.sep) && resolved !== uploadsRoot) {
    return null;
  }
  return resolved;
}

function signFileAccess(storedPath, userId, expiresIn = DEFAULT_TTL) {
  const normalized = normalizeStoredPath(storedPath);
  if (!normalized) {
    throw new Error('Invalid file path');
  }
  return jwt.sign(
    {
      type: 'file_access',
      path: normalized,
      userId: userId ? userId.toString() : undefined
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function verifyFileAccessToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== 'file_access' || !decoded.path) {
    throw new Error('Invalid file access token');
  }
  return decoded;
}

function getApiBaseUrl(req) {
  if (process.env.API_URL) return process.env.API_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function buildSignedFileUrl(storedPath, userId, req, expiresIn = DEFAULT_TTL) {
  const token = signFileAccess(storedPath, userId, expiresIn);
  return `${getApiBaseUrl(req)}/api/files/serve?token=${encodeURIComponent(token)}`;
}

function getSignedUrlExpiryIso(expiresIn = DEFAULT_TTL) {
  const ms =
    expiresIn.endsWith('h') ? parseInt(expiresIn, 10) * 3600000 :
    expiresIn.endsWith('m') ? parseInt(expiresIn, 10) * 60000 :
    expiresIn.endsWith('d') ? parseInt(expiresIn, 10) * 86400000 :
    3600000;
  return new Date(Date.now() + ms).toISOString();
}

module.exports = {
  normalizeStoredPath,
  getAbsoluteFilePath,
  signFileAccess,
  verifyFileAccessToken,
  buildSignedFileUrl,
  getSignedUrlExpiryIso,
  getApiBaseUrl,
  DEFAULT_TTL
};
