const { WebhookReceiver } = require('livekit-server-sdk');
const Recording = require('../models/Recording');
const Class = require('../models/Class');
const { getLiveKitConfig } = require('../utils/livekit');
const {
  extractEgressFile,
  isEgressTerminalSuccess,
  isEgressTerminalFailure,
} = require('../utils/livekitEgress');
const { normalizeStorageKey } = require('../utils/objectStorage');
const { upsertSessionRecording } = require('../utils/recordingHelper');

function getReceiver() {
  const { apiKey, apiSecret } = getLiveKitConfig();
  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit credentials missing for webhook verification');
  }
  return new WebhookReceiver(apiKey, apiSecret);
}

async function handleLiveKitWebhook(req, res) {
  try {
    const receiver = getReceiver();
    const authHeader = req.get('Authorization') || '';
    const body =
      Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body || {});

    const event = await receiver.receive(body, authHeader);
    const eventType = event.event;

    if (
      eventType === 'egress_ended' ||
      eventType === 'egress_updated' ||
      eventType === 'egress_started'
    ) {
      await handleEgressEvent(event);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('livekit webhook:', err.message || err);
    // Acknowledge to avoid endless retries on signature issues after logs
    res.status(200).json({ ok: false, error: err.message });
  }
}

async function handleEgressEvent(event) {
  const info = event.egressInfo;
  if (!info?.egressId) return;

  let recording = await Recording.findOne({ egressId: info.egressId });
  if (!recording && info.roomName) {
    const classItem = await Class.findOne({ 'liveConfig.meetingId': info.roomName }).select('_id');
    if (classItem) {
      recording = await Recording.findOne({ session: classItem._id });
    }
  }
  if (!recording) {
    console.warn('livekit webhook: no Recording for egress', info.egressId, info.roomName);
    return;
  }

  if (event.event === 'egress_started') {
    await upsertSessionRecording(recording.session, {
      egressId: info.egressId,
      status: 'processing',
    });
    return;
  }

  if (isEgressTerminalSuccess(info.status)) {
    const file = extractEgressFile(info);
    // Prefer filename (object key) when location is a path-style URL that includes the bucket
    const key =
      normalizeStorageKey(file?.location) ||
      normalizeStorageKey(file?.filename);
    if (!key) {
      console.warn('livekit webhook: egress complete without usable key', {
        egressId: info.egressId,
        location: file?.location,
        filename: file?.filename,
      });
      await upsertSessionRecording(recording.session, {
        egressId: info.egressId,
        status: 'failed',
        failureReason: 'Egress completed without file location',
      });
      return;
    }

    console.log('livekit webhook: recording ready', { egressId: info.egressId, key });

    const updated = await upsertSessionRecording(recording.session, {
      egressId: info.egressId,
      storageUrl: key,
      status: 'ready',
      durationSeconds: file.durationSeconds,
      failureReason: null,
    });

    // Keep recording URL; if the host already ended (or abandoned) the live room,
    // mark the class completed so dashboards that filter on status still find it.
    const classItem = await Class.findById(recording.session).select('status liveConfig');
    const classUpdate = {
      'liveConfig.recordingUrl': key,
      'liveConfig.recordingStarted': true,
    };
    if (classItem && (classItem.status === 'ongoing' || classItem.liveConfig?.sessionEndedAt)) {
      classUpdate.status = 'completed';
      if (!classItem.liveConfig?.sessionEndedAt) {
        classUpdate['liveConfig.sessionEndedAt'] = new Date();
      }
    }
    await Class.findByIdAndUpdate(recording.session, classUpdate);

    return updated;
  }

  if (isEgressTerminalFailure(info.status)) {
    await upsertSessionRecording(recording.session, {
      egressId: info.egressId,
      status: 'failed',
      failureReason: info.error || `Egress status: ${info.status}`,
    });
  }
}

module.exports = { handleLiveKitWebhook };
