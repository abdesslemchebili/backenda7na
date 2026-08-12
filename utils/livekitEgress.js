const {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  EgressStatus,
} = require('livekit-server-sdk');
const { getLiveKitConfig, isLiveKitConfigured } = require('./livekit');
const { getObjectStorageConfig, isObjectStorageConfigured } = require('./objectStorage');

function liveKitHttpHost() {
  const { url } = getLiveKitConfig();
  if (!url) return '';
  return url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
}

function isEgressConfigured() {
  return isLiveKitConfigured() && isObjectStorageConfigured();
}

function getEgressClient() {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured');
  }
  const { apiKey, apiSecret } = getLiveKitConfig();
  return new EgressClient(liveKitHttpHost(), apiKey, apiSecret);
}

function buildFileOutput(roomName, classId) {
  const cfg = getObjectStorageConfig();
  const safeRoom = String(roomName || 'session').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const filepath = `recordings/${classId || safeRoom}/${safeRoom}-{time}.mp4`;

  const s3 = new S3Upload({
    accessKey: cfg.accessKey,
    secret: cfg.secret,
    bucket: cfg.bucket,
    region: cfg.region,
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.forcePathStyle,
  });

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    disableManifest: true,
    output: {
      case: 's3',
      value: s3,
    },
  });
}

/**
 * Start room-composite recording for a LiveKit room.
 * @returns {Promise<{ egressId: string, status: string }>}
 */
async function startRoomRecording({ roomName, classId }) {
  if (!isEgressConfigured()) {
    throw new Error(
      'LiveKit Egress requires LIVEKIT_* and S3_* (or AWS_*) credentials'
    );
  }
  const client = getEgressClient();
  const fileOutput = buildFileOutput(roomName, classId);
  const info = await client.startRoomCompositeEgress(roomName, { file: fileOutput }, {
    layout: 'speaker',
    audioOnly: false,
    videoOnly: false,
  });
  return {
    egressId: info.egressId,
    status: String(info.status),
  };
}

async function stopRoomRecording(egressId) {
  if (!egressId) return null;
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured');
  }
  const client = getEgressClient();
  try {
    const info = await client.stopEgress(egressId);
    return {
      egressId: info.egressId,
      status: String(info.status),
    };
  } catch (err) {
    const msg = err?.message || String(err);
    // Already stopped / not found — treat as soft success
    if (/not found|already|ended|complete/i.test(msg)) {
      return { egressId, status: 'EGRESS_COMPLETE', soft: true };
    }
    throw err;
  }
}

function extractEgressFile(info) {
  if (!info) return null;
  const fromResults = Array.isArray(info.fileResults) && info.fileResults.length
    ? info.fileResults[0]
    : null;
  const file = fromResults || info.file || null;
  if (!file) return null;

  const location = file.location || file.filename || null;
  let durationSeconds = null;
  if (file.duration != null) {
    const nanos = Number(file.duration);
    if (Number.isFinite(nanos) && nanos > 0) {
      durationSeconds = Math.round(nanos / 1e9);
    }
  }
  return { location, durationSeconds, filename: file.filename || null };
}

function isEgressTerminalSuccess(status) {
  return status === EgressStatus.EGRESS_COMPLETE || status === 'EGRESS_COMPLETE' || status === 3;
}

function isEgressTerminalFailure(status) {
  return (
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED ||
    status === 'EGRESS_FAILED' ||
    status === 'EGRESS_ABORTED' ||
    status === 'EGRESS_LIMIT_REACHED' ||
    status === 4 ||
    status === 5 ||
    status === 6
  );
}

module.exports = {
  isEgressConfigured,
  startRoomRecording,
  stopRoomRecording,
  extractEgressFile,
  isEgressTerminalSuccess,
  isEgressTerminalFailure,
  liveKitHttpHost,
};
