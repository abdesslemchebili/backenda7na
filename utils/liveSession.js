const crypto = require('crypto');
const ClassGroup = require('../models/ClassGroup');

const JOIN_BUFFER_MS = 15 * 60 * 1000;
const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000;

function generateLiveMeetingCredentials() {
  return {
    meetingId: `na-${crypto.randomBytes(12).toString('hex')}`,
    meetingPassword: crypto.randomBytes(4).toString('hex'),
  };
}

function getSessionWindow(classItem) {
  const start = classItem.schedule?.startTime
    ? new Date(classItem.schedule.startTime).getTime()
    : null;
  const end = classItem.schedule?.endTime
    ? new Date(classItem.schedule.endTime).getTime()
    : start
      ? start + 90 * 60 * 1000
      : null;
  return { start, end };
}

function isWithinJoinWindow(classItem, now = Date.now()) {
  if (classItem.type !== 'live') return false;
  if (classItem.status === 'cancelled') return false;

  const { start, end } = getSessionWindow(classItem);
  if (!start) {
    return classItem.status === 'ongoing' || classItem.status === 'scheduled';
  }

  const windowStart = start - JOIN_BUFFER_MS;
  const windowEnd = (end || start + 90 * 60 * 1000) + JOIN_GRACE_AFTER_MS;

  if (now < windowStart) return false;
  if (now > windowEnd) return false;

  return ['scheduled', 'ongoing', 'completed'].includes(classItem.status);
}

function canHostStartSession(classItem, now = Date.now()) {
  if (classItem.type !== 'live') return false;
  if (classItem.status === 'cancelled' || classItem.status === 'completed') return false;
  const { start, end } = getSessionWindow(classItem);
  if (!start) return true;
  const windowStart = start - JOIN_BUFFER_MS;
  const windowEnd = (end || start + 90 * 60 * 1000) + JOIN_GRACE_AFTER_MS;
  return now >= windowStart && now <= windowEnd;
}

async function isStudentInClassGroup(studentId, classItem) {
  if (
    (classItem.enrolledStudents || []).some(
      (e) => e.student && e.student.toString() === studentId.toString()
    )
  ) {
    return true;
  }

  if (classItem.classGroupId) {
    const group = await ClassGroup.findById(classItem.classGroupId).select('studentIds');
    if (group?.studentIds?.some((id) => id.toString() === studentId.toString())) {
      return true;
    }
  }

  const User = require('../models/User');
  const user = await User.findById(studentId).select('studentInfo.classGroupId');
  if (
    classItem.classGroupId &&
    user?.studentInfo?.classGroupId?.toString() === classItem.classGroupId.toString()
  ) {
    return true;
  }

  return false;
}

/** @deprecated alias */
const isStudentEnrolledInClassCourse = isStudentInClassGroup;

async function canProfessorHostClass(user, classItem) {
  if (user.role === 'admin') return true;
  if (classItem.professor && classItem.professor.toString() === user._id.toString()) return true;
  if (!classItem.classGroupId) return false;
  const group = await ClassGroup.findById(classItem.classGroupId).select('professorId');
  return !!(group && group.professorId?.toString() === user._id.toString());
}

async function assertLiveJoinAccess(req, classItem) {
  if (classItem.type !== 'live') {
    return { ok: false, status: 400, message: 'Not a live session' };
  }
  if (classItem.status === 'cancelled') {
    return { ok: false, status: 400, message: 'Session cancelled' };
  }

  const isHost = await canProfessorHostClass(req.user, classItem);

  if (req.user.role === 'student') {
    if (req.user.status !== 'reglo') {
      return {
        ok: false,
        status: 403,
        message: 'Payment must be confirmed to join live sessions',
      };
    }
    const enrolled = await isStudentInClassGroup(req.user._id, classItem);
    if (!enrolled) {
      return { ok: false, status: 403, message: 'Not enrolled in this class group' };
    }
  } else if (!isHost && req.user.role !== 'admin') {
    return { ok: false, status: 403, message: 'Not authorized to join this session' };
  }

  if (isHost) {
    if (!canHostStartSession(classItem)) {
      return {
        ok: false,
        status: 403,
        message: 'Session is outside the allowed hosting window',
      };
    }
  } else if (!isWithinJoinWindow(classItem)) {
    return {
      ok: false,
      status: 403,
      message: 'Session is not open for joining yet or has ended',
    };
  }

  if (classItem.status === 'completed' && !isWithinJoinWindow(classItem)) {
    return { ok: false, status: 403, message: 'Session has ended' };
  }

  return { ok: true, isHost };
}

function ensureLiveConfigCredentials(classItem) {
  const creds = generateLiveMeetingCredentials();
  return {
    meetingId: classItem.liveConfig?.meetingId || creds.meetingId,
    meetingPassword: classItem.liveConfig?.meetingPassword || creds.meetingPassword,
  };
}

function sanitizeClassLiveConfig(classItem, isHost) {
  const obj = classItem.toObject ? classItem.toObject() : { ...classItem };
  if (obj.liveConfig && !isHost) {
    const { meetingPassword, meetingId, ...rest } = obj.liveConfig;
    obj.liveConfig = rest;
  }
  return obj;
}

module.exports = {
  JOIN_BUFFER_MS,
  generateLiveMeetingCredentials,
  getSessionWindow,
  isWithinJoinWindow,
  canHostStartSession,
  assertLiveJoinAccess,
  canProfessorHostClass,
  isStudentInClassGroup,
  isStudentEnrolledInClassCourse,
  ensureLiveConfigCredentials,
  sanitizeClassLiveConfig,
};
