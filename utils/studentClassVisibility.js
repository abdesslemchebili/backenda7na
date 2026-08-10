const Course = require('../models/Course');
const ClassGroup = require('../models/ClassGroup');
const Class = require('../models/Class');
const User = require('../models/User');
const { enrollStudentInCourseFromClassGroup } = require('./courseEnrollment');

/**
 * Contexte de visibilité des sessions live pour un étudiant :
 * cours inscrits, cohortes (studentIds + studentInfo.classGroupId).
 */
async function getStudentVisibilityContext(userId) {
  const userIdStr = userId.toString();

  const user = await User.findById(userId).select('studentInfo.classGroupId').lean();

  const groupQuery = {
    status: { $ne: 'archived' },
    $or: [{ studentIds: userId }],
  };
  if (user?.studentInfo?.classGroupId) {
    groupQuery.$or.push({ _id: user.studentInfo.classGroupId });
  }

  const [enrolledCourses, memberGroups] = await Promise.all([
    Course.find({ 'enrolledStudents.student': userId }).select('_id').lean(),
    ClassGroup.find(groupQuery).select('_id courseId professorId').lean(),
  ]);

  const classGroupIds = memberGroups.map((g) => g._id.toString());
  const courseIds = new Set(enrolledCourses.map((c) => c._id.toString()));

  memberGroups.forEach((g) => {
    if (g.courseId) courseIds.add(g.courseId.toString());
  });

  const cohortCourseProfessorPairs = memberGroups
    .filter((g) => g.courseId && g.professorId)
    .map((g) => ({
      course: g.courseId,
      professor: g.professorId,
    }));

  return {
    userId: userIdStr,
    courseIds: Array.from(courseIds),
    classGroupIds,
    cohortCourseProfessorPairs,
  };
}

function buildStudentClassVisibilityFilter(ctx) {
  const or = [{ 'enrolledStudents.student': ctx.userId }];
  if (ctx.courseIds.length) {
    or.push({ course: { $in: ctx.courseIds } });
  }
  if (ctx.classGroupIds.length) {
    or.push({ classGroupId: { $in: ctx.classGroupIds } });
  }
  for (const pair of ctx.cohortCourseProfessorPairs || []) {
    or.push({ course: pair.course, professor: pair.professor });
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
 * à la session (Class.enrolledStudents) et au cours lié.
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
      await enrollStudentInCourseFromClassGroup(sid, classGroup);
    } catch (err) {
      console.error('enrollStudentInCourseFromClassGroup:', sidStr, err.message);
    }
  }
}

/**
 * Synchronise un étudiant avec sa cohorte : profil, cours, sessions existantes.
 */
async function syncStudentToClassGroup(userId, classGroup) {
  if (!classGroup?._id) return;

  await User.findByIdAndUpdate(userId, {
    'studentInfo.classGroupId': classGroup._id,
  });

  try {
    await enrollStudentInCourseFromClassGroup(userId, classGroup);
  } catch (err) {
    console.error('syncStudentToClassGroup enroll:', userId, err.message);
  }

  const sessionOr = [{ classGroupId: classGroup._id }];
  if (classGroup.courseId && classGroup.professorId) {
    sessionOr.push({
      course: classGroup.courseId,
      professor: classGroup.professorId,
    });
  }

  const sessions = await Class.find({
    type: 'live',
    status: { $in: ['scheduled', 'ongoing'] },
    $or: sessionOr,
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
  const user = await User.findById(userId).select('studentInfo.classGroupId').lean();
  const query = {
    status: { $ne: 'archived' },
    $or: [{ studentIds: userId }],
  };
  if (user?.studentInfo?.classGroupId) {
    query.$or.push({ _id: user.studentInfo.classGroupId });
  }
  const groups = await ClassGroup.find(query);
  for (const group of groups) {
    await syncStudentToClassGroup(userId, group);
  }
}

module.exports = {
  getStudentVisibilityContext,
  buildStudentClassVisibilityFilter,
  getStudentVisibleClassFilter,
  studentCanAccessClass,
  enrollClassGroupStudentsInSession,
  syncStudentToClassGroup,
  syncClassGroupStudents,
  syncStudentCohortSessions,
};
