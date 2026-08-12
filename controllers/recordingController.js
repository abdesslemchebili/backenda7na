const Recording = require('../models/Recording');
const Class = require('../models/Class');
const {
  formatRecording,
  canAccessSessionRecording,
  upsertSessionRecording,
} = require('../utils/recordingHelper');
const { buildSignedFileUrl, getSignedUrlExpiryIso } = require('../utils/fileAccess');
const {
  isObjectStorageConfigured,
  buildObjectPresignedUrl,
  normalizeStorageKey,
} = require('../utils/objectStorage');

// GET /api/recordings/session/:classId
const getBySession = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.classId);
    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    }
    if (!(await canAccessSessionRecording(req, classItem))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const recording = await Recording.findOne({ session: classItem._id }).lean();
    if (!recording) {
      return res.json({ data: null });
    }
    res.json({ data: formatRecording(recording) });
  } catch (err) {
    console.error('getBySession recording:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/recordings
const createOrUpdate = async (req, res) => {
  try {
    const { sessionId, externalUrl, storageUrl, status, durationSeconds, failureReason } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'ValidationError', message: 'sessionId is required' });
    }

    const classItem = await Class.findById(sessionId);
    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    }
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const recording = await upsertSessionRecording(
      sessionId,
      { externalUrl, storageUrl, status, durationSeconds, failureReason },
      req.user._id
    );

    if (recording.status === 'ready' && (recording.externalUrl || recording.storageUrl)) {
      await Class.findByIdAndUpdate(sessionId, {
        'liveConfig.recordingUrl': recording.externalUrl || recording.storageUrl,
      });
    }

    res.json(formatRecording(recording));
  } catch (err) {
    console.error('createOrUpdate recording:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/recordings/:id
const updateRecording = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ error: 'NotFound', message: 'Recording not found' });
    }

    const classItem = await Class.findById(recording.session);
    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Session not found' });
    }
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const { externalUrl, storageUrl, status, durationSeconds, failureReason } = req.body;
    if (externalUrl !== undefined) recording.externalUrl = externalUrl || null;
    if (storageUrl !== undefined) recording.storageUrl = storageUrl || null;
    if (status !== undefined) recording.status = status;
    if (durationSeconds !== undefined) recording.durationSeconds = durationSeconds != null ? Number(durationSeconds) : null;
    if (failureReason !== undefined) recording.failureReason = failureReason || null;

    if (recording.status === 'ready' && !recording.externalUrl && !recording.storageUrl) {
      return res.status(400).json({ error: 'ValidationError', message: 'URL required for ready status' });
    }

    await recording.save();

    if (recording.status === 'ready' && (recording.externalUrl || recording.storageUrl)) {
      await Class.findByIdAndUpdate(recording.session, {
        'liveConfig.recordingUrl': recording.externalUrl || recording.storageUrl,
      });
    }

    res.json(formatRecording(recording));
  } catch (err) {
    console.error('updateRecording:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/recordings/:id/access
const getAccessUrl = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id).lean();
    if (!recording) {
      return res.status(404).json({ error: 'NotFound', message: 'Recording not found' });
    }
    if (recording.status !== 'ready') {
      return res.status(404).json({ error: 'NotFound', message: 'Recording not available yet' });
    }

    const classItem = await Class.findById(recording.session);
    if (!classItem || !(await canAccessSessionRecording(req, classItem))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    if (recording.externalUrl) {
      return res.json({ url: recording.externalUrl, external: true });
    }
    if (!recording.storageUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'No playback URL' });
    }

    // LiveKit Egress → S3/R2 object key
    if (isObjectStorageConfigured() && !recording.storageUrl.startsWith('/uploads/')) {
      const key = normalizeStorageKey(recording.storageUrl);
      const signed = await buildObjectPresignedUrl(key);
      return res.json({
        url: signed.url,
        expiresAt: signed.expiresAt,
        external: signed.external,
      });
    }

    const url = buildSignedFileUrl(recording.storageUrl, req.user._id, req);
    res.json({
      url,
      expiresAt: getSignedUrlExpiryIso(),
      external: false,
    });
  } catch (err) {
    console.error('getAccessUrl recording:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { getBySession, createOrUpdate, updateRecording, getAccessUrl };
