const mongoose = require('mongoose');
const ClassGroup = require('../models/ClassGroup');
const Class = require('../models/Class');
const User = require('../models/User');
const { ensureStudentInClassGroup } = require('./groupEnrollment');

/**
 * Sessions live visibles au planning étudiant : pas encore terminées
 * (inclut en cours + planifiées même si l'heure de début est passée).
 */
function buildActiveLiveSessionTimeFilter(now = new Date()) {
  return {
    $or: [
      { 'schedule.endTime': { $gt: now } },
      { status: 'ongoing' },
      {
        'schedule.endTime': { $exists: false },
        'schedule.startTime': { $gt: now },
      },
    ],
  };
}

async function buildStudentScheduleMongoFilter(userId, options = {}) {
  const visibility = await getStudentVisibleClassFilter(userId);
  const now = options.now || new Date();
  const days = options.days ?? 180;
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const and = [
    visibility,
    { type: 'live' },
    { status: { $in: ['scheduled', 'ongoing'] } },
    buildActiveLiveSessionTimeFilter(now),
    { 'schedule.startTime': { $lte: horizon } },
  ];

  return { $and: and };
}

/**
 * Contexte de visibilité des sessions live pour un étudiant :
 * cohortes (studentIds + studentInfo.classGroupId + enrolledGroups).
 */
async function getStudentVisibilityContext(userId) {
  const uid =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(String(userId));

  const user = await User.findById(uid)
    .select('studentInfo.classGroupId studentInfo.enrolledGroups')
    .lean();

  const groupQuery = {
    status: { $ne: 'archived' },
    $or: [{ studentIds: uid }],
  };
  if (user?.studentInfo?.classGroupId) {
    groupQuery.$or.push({ _id: user.studentInfo.classGroupId });
  }
  const enrolled = user?.studentInfo?.enrolledGroups || [];
  if (enrolled.length) {
    groupQuery.$or.push({ _id: { $in: enrolled } });
  }

  const memberGroups = await ClassGroup.find(groupQuery).select('_id professorId').lean();
  const classGroupIds = memberGroups.map((g) => g._id);

  return {
    userId: uid,
    classGroupIds,
  };
}

function buildStudentClassVisibilityFilter(ctx) {
  const or = [{ 'enrolledStudents.student': ctx.userId }];
  if (ctx.classGroupIds.length) {
    or.push({ classGroupId: { $in: ctx.classGroupIds } });
  }
  return { $or: or };
}

async function getStudentVisibleClassFilter(userId) {
  const ctx = await getStudentVisibilityContext(userId);
  return buildStudentClassVisibilityFilter(ctx);
}

async function studentCanAccessClass(userId, classItem) {
  const filter = await getStudentVisibleClassFilter(userId);
  return !!(await Class.countDocuments({
    _id: classItem._id,
    ...filter,
  }));
}

/**
 * À la création d'une session pour une cohorte : inscrire les étudiants
 * à la session (Class.enrolledStudents) et assurer le membership groupe.
 */
async function enrollClassGroupStudentsInSession(classGroup, classDoc) {
  const studentIds = classGroup.studentIds || [];
  const now = new Date();
  const existing = new Set(
    (classDoc.enrolledStudents || []).map((e) => e.student?.toString()).filter(Boolean)
  );

  for (const sid of studentIds) {
    const sidStr = sid.toString();
    if (!existing.has(sidStr)) {
      classDoc.enrolledStudents.push({ student: sid, enrolledAt: now });
      existing.add(sidStr);
    }
    try {
      await ensureStudentInClassGroup(sid, classGroup);
    } catch (err) {
      console.error('ensureStudentInClassGroup:', sidStr, err.message);
    }
  }
}

/**
 * Synchronise un étudiant avec sa cohorte : profil + sessions existantes.
 */
async function syncStudentToClassGroup(userId, classGroup) {
  if (!classGroup?._id) return;

  try {
    await ensureStudentInClassGroup(userId, classGroup);
  } catch (err) {
    console.error('syncStudentToClassGroup enroll:', userId, err.message);
  }

  const sessions = await Class.find({
    type: 'live',
    status: { $in: ['scheduled', 'ongoing'] },
    classGroupId: classGroup._id,
  });
  const userIdStr = userId.toString();
  for (const session of sessions) {
    const exists = (session.enrolledStudents || []).some(
      (e) => e.student && e.student.toString() === userIdStr
    );
    if (!exists) {
      session.enrolledStudents.push({ student: userId, enrolledAt: new Date() });
      await session.save();
    }
  }
}

async function syncClassGroupStudents(classGroup) {
  if (!classGroup?.studentIds?.length) return;
  for (const sid of classGroup.studentIds) {
    await syncStudentToClassGroup(sid, classGroup);
  }
}

/** Appelé au chargement du dashboard étudiant pour rattraper les sessions manquantes. */
async function syncStudentCohortSessions(userId) {
  const user = await User.findById(userId).select('studentInfo.classGroupId studentInfo.enrolledGroups').lean();
  const query = {
    status: { $ne: 'archived' },
    $or: [{ studentIds: userId }],
  };
  if (user?.studentInfo?.classGroupId) {
    query.$or.push({ _id: user.studentInfo.classGroupId });
  }
  const enrolled = user?.studentInfo?.enrolledGroups || [];
  if (enrolled.length) {
    query.$or.push({ _id: { $in: enrolled } });
  }
  const groups = await ClassGroup.find(query);
  for (const group of groups) {
    await syncStudentToClassGroup(userId, group);
  }
}

/**
 * Passe en completed les lives dont l'heure de fin est dépassée
 * (évite que le planning prof affiche encore des sessions déjà terminées).
 */
async function completeExpiredLiveSessions(now = new Date()) {
  await Class.updateMany(
    {
      type: 'live',
      status: { $in: ['scheduled', 'ongoing'] },
      'schedule.endTime': { $lte: now },
    },
    { $set: { status: 'completed' } }
  );
}

async function fetchStudentScheduleSessions(userId, options = {}) {
  await completeExpiredLiveSessions(options.now || new Date());
  await syncStudentCohortSessions(userId);
  const filter = await buildStudentScheduleMongoFilter(userId, options);
  return Class.find(filter)
    .populate('classGroupId', 'name languageId level bookId')
    .populate('professor', 'firstName lastName email')
    .sort({ 'schedule.startTime': 1 })
    .limit(options.limit ?? 100)
    .lean();
}

module.exports = {
  buildActiveLiveSessionTimeFilter,
  buildStudentScheduleMongoFilter,
  getStudentVisibilityContext,
  buildStudentClassVisibilityFilter,
  getStudentVisibleClassFilter,
  studentCanAccessClass,
  enrollClassGroupStudentsInSession,
  syncStudentToClassGroup,
  syncClassGroupStudents,
  syncStudentCohortSessions,
  completeExpiredLiveSessions,
  fetchStudentScheduleSessions,
};
