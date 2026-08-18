const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

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

function isLocalUploadPath(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return false;
  return storedPath.startsWith('/uploads/') || storedPath.startsWith('uploads/');
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
 * Strip leading bucket name from path-style S3/R2 URLs / keys.
 * e.g. "nouracademy-recordings/recordings/x.mp4" → "recordings/x.mp4"
 */
function stripBucketPrefix(key) {
  if (!key) return key;
  const cfg = getObjectStorageConfig();
  const bucket = (cfg.bucket || '').replace(/^\/+|\/+$/g, '');
  if (!bucket) return key;
  if (key === bucket) return '';
  if (key.startsWith(`${bucket}/`)) {
    return key.slice(bucket.length + 1);
  }
  return key;
}

/**
 * Normalize LiveKit / S3 locations to a storage object key.
 * Accepts: "recordings/x.mp4", "s3://bucket/key", or https URLs ending with the key.
 * Path-style R2 URLs include `/bucket/key` — the bucket segment is stripped.
 */
function normalizeStorageKey(locationOrKey) {
  if (!locationOrKey || typeof locationOrKey !== 'string') return null;
  const raw = locationOrKey.trim();
  if (!raw) return null;

  if (isLocalUploadPath(raw)) return null;

  if (raw.startsWith('s3://')) {
    const withoutScheme = raw.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    if (slash === -1) return null;
    return stripBucketPrefix(withoutScheme.slice(slash + 1));
  }

  const cfg = getObjectStorageConfig();
  if (cfg.publicBaseUrl && raw.startsWith(cfg.publicBaseUrl + '/')) {
    return stripBucketPrefix(raw.slice(cfg.publicBaseUrl.length + 1));
  }

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      let path = u.pathname.replace(/^\//, '');
      // Virtual-hosted–style: bucket.account.r2.cloudflarestorage.com/key
      // Path-style: account.r2.cloudflarestorage.com/bucket/key
      path = stripBucketPrefix(path);
      return path || null;
    }
  } catch {
    /* ignore */
  }

  return stripBucketPrefix(raw.replace(/^\//, '')) || null;
}

async function objectExists(storageUrl) {
  const key = normalizeStorageKey(storageUrl);
  if (!key || !isObjectStorageConfigured()) return false;
  const cfg = getObjectStorageConfig();
  const client = createS3Client();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    const code = err?.name || err?.Code || err?.$metadata?.httpStatusCode;
    if (code === 'NotFound' || code === 'NoSuchKey' || code === 404) return false;
    // AccessDenied etc. — treat as unknown/exists to avoid blocking playback
    if (err?.$metadata?.httpStatusCode === 404) return false;
    console.warn('objectExists:', err.message || err);
    return false;
  }
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
      key,
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
    key,
  };
}

/**
 * Upload a local file to S3/R2 and return the object key.
 */
async function uploadLocalFileToObjectStorage({ localPath, key, contentType }) {
  if (!isObjectStorageConfigured()) {
    throw new Error('Object storage (S3/R2) is not configured');
  }
  const cfg = getObjectStorageConfig();
  const client = createS3Client();
  const stat = fs.statSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType || 'application/octet-stream',
      ContentLength: stat.size,
    })
  );
  return key;
}

/**
 * Stream an object from S3/R2 (Body is a Node Readable).
 * @param {string} storageUrl
 * @param {{ range?: string }} [opts] HTTP Range header value, e.g. "bytes=0-65535"
 */
async function getObjectStream(storageUrl, opts = {}) {
  const key = normalizeStorageKey(storageUrl);
  if (!key || !isObjectStorageConfigured()) {
    throw new Error('Object not available in storage');
  }
  const cfg = getObjectStorageConfig();
  const client = createS3Client();
  const params = {
    Bucket: cfg.bucket,
    Key: key,
  };
  if (opts.range) params.Range = opts.range;
  const out = await client.send(new GetObjectCommand(params));
  return {
    key,
    body: out.Body,
    contentType: out.ContentType || 'application/octet-stream',
    contentLength: out.ContentLength,
    contentRange: out.ContentRange || null,
    acceptRanges: out.AcceptRanges || 'bytes',
    statusCode: opts.range ? 206 : 200,
  };
}

async function deleteObjectFromStorage(storageUrl) {
  const key = normalizeStorageKey(storageUrl);
  if (!key || !isObjectStorageConfigured()) return;
  const cfg = getObjectStorageConfig();
  const client = createS3Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      })
    );
  } catch (err) {
    console.warn('deleteObjectFromStorage:', err.message || err);
  }
}

module.exports = {
  getObjectStorageConfig,
  isObjectStorageConfigured,
  isLocalUploadPath,
  normalizeStorageKey,
  stripBucketPrefix,
  objectExists,
  buildObjectPresignedUrl,
  uploadLocalFileToObjectStorage,
  getObjectStream,
  deleteObjectFromStorage,
  DEFAULT_PRESIGN_TTL,
};
