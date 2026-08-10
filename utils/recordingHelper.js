const Recording = require('../models/Recording');
const Class = require('../models/Class');
const Course = require('../models/Course');
const { buildSignedFileUrl, getSignedUrlExpiryIso } = require('./fileAccess');

function formatRecording(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const playbackUrl = o.status === 'ready' && o.externalUrl ? o.externalUrl : null;
  const requiresSignedAccess = o.status === 'ready' && !!o.storageUrl && !o.externalUrl;
  return {
    _id: o._id,
    session: o.session?._id ? o.session._id.toString() : o.session?.toString?.() || o.session,
    externalUrl: o.externalUrl,
    playbackUrl,
    requiresSignedAccess,
    durationSeconds: o.durationSeconds,
    status: o.status,
    failureReason: o.failureReason,
    uploadedBy: o.uploadedBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function canAccessSessionRecording(req, classItem) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (classItem.professor.toString() === req.user._id.toString()) return true;

  if (req.user.role === 'student') {
    const course = await Course.findById(classItem.course).select('enrolledStudents');
    if (!course) return false;
    return course.enrolledStudents.some((e) => e.student?.toString() === req.user._id.toString());
  }
  return false;
}

async function upsertSessionRecording(sessionId, payload, userId) {
  const { externalUrl, storageUrl, status, durationSeconds, failureReason } = payload;

  let recording = await Recording.findOne({ session: sessionId });
  const data = {};

  if (externalUrl !== undefined) data.externalUrl = externalUrl || null;
  if (storageUrl !== undefined) data.storageUrl = storageUrl || null;
  if (durationSeconds !== undefined) data.durationSeconds = durationSeconds != null ? Number(durationSeconds) : null;
  if (failureReason !== undefined) data.failureReason = failureReason || null;

  if (status) {
    data.status = status;
  } else if (externalUrl || storageUrl) {
    data.status = 'ready';
  }

  if (recording) {
    Object.assign(recording, data);
    if (userId) recording.uploadedBy = userId;
    await recording.save();
  } else {
    recording = await Recording.create({
      session: sessionId,
      ...data,
      status: data.status || 'processing',
      uploadedBy: userId || null,
    });
  }

  return recording;
}

async function attachRecordingToClass(classDoc) {
  if (!classDoc) return null;
  const o = classDoc.toObject ? classDoc.toObject() : { ...classDoc };
  const rec = await Recording.findOne({ session: o._id }).lean();
  o.recording = formatRecording(rec);
  return o;
}

async function attachRecordingsToClasses(classes) {
  if (!classes?.length) return [];
  const ids = classes.map((c) => (c._id || c).toString());
  const recordings = await Recording.find({ session: { $in: ids } }).lean();
  const bySession = new Map();
  for (const r of recordings) {
    if (!r?.session) continue;
    bySession.set(r.session.toString(), r);
  }
  return classes.map((c) => {
    const o = c.toObject ? c.toObject() : { ...c };
    const rec = bySession.get(o._id.toString());
    o.recording = formatRecording(rec);
    return o;
  });
}

module.exports = {
  formatRecording,
  canAccessSessionRecording,
  upsertSessionRecording,
  attachRecordingToClass,
  attachRecordingsToClasses,
};
