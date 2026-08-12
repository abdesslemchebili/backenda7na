const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const DEFAULT_PRESIGN_TTL = 3600;

function getObjectStorageConfig() {
  return {
    accessKey: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '',
    secret: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  };
}

function isObjectStorageConfigured() {
  const { accessKey, secret, bucket } = getObjectStorageConfig();
  return Boolean(accessKey && secret && bucket);
}

function createS3Client() {
  const cfg = getObjectStorageConfig();
  if (!isObjectStorageConfigured()) {
    throw new Error('Object storage (S3/R2) is not configured');
  }
  const clientConfig = {
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secret,
    },
  };
  if (cfg.endpoint) {
    clientConfig.endpoint = cfg.endpoint;
    clientConfig.forcePathStyle = cfg.forcePathStyle;
  }
  return new S3Client(clientConfig);
}

/**
 * Normalize LiveKit / S3 locations to a storage object key.
 * Accepts: "recordings/x.mp4", "s3://bucket/key", or https URLs ending with the key.
 */
function normalizeStorageKey(locationOrKey) {
  if (!locationOrKey || typeof locationOrKey !== 'string') return null;
  const raw = locationOrKey.trim();
  if (!raw) return null;

  if (raw.startsWith('s3://')) {
    const withoutScheme = raw.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    if (slash === -1) return null;
    return withoutScheme.slice(slash + 1);
  }

  const cfg = getObjectStorageConfig();
  if (cfg.publicBaseUrl && raw.startsWith(cfg.publicBaseUrl + '/')) {
    return raw.slice(cfg.publicBaseUrl.length + 1);
  }

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      return u.pathname.replace(/^\//, '');
    }
  } catch {
    /* ignore */
  }

  return raw.replace(/^\//, '');
}

async function buildObjectPresignedUrl(storageUrl, expiresIn = DEFAULT_PRESIGN_TTL) {
  const key = normalizeStorageKey(storageUrl);
  if (!key) {
    throw new Error('Invalid storage key');
  }
  const cfg = getObjectStorageConfig();
  if (cfg.publicBaseUrl) {
    return {
      url: `${cfg.publicBaseUrl}/${key}`,
      expiresAt: null,
      external: true,
    };
  }

  const client = createS3Client();
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    external: false,
  };
}

module.exports = {
  getObjectStorageConfig,
  isObjectStorageConfigured,
  normalizeStorageKey,
  buildObjectPresignedUrl,
  DEFAULT_PRESIGN_TTL,
};
