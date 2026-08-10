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

  const [enrolledCourses, memberGroups, user] = await Promise.all([
    Course.find({ 'enrolledStudents.student': userId }).select('_id').lean(),
    ClassGroup.find({ studentIds: userId, status: { $ne: 'archived' } }).select('_id courseId').lean(),
    User.findById(userId).select('studentInfo.classGroupId').lean(),
  ]);

  const classGroupIds = new Set(memberGroups.map((g) => g._id.toString()));
  if (user?.studentInfo?.classGroupId) {
    classGroupIds.add(user.studentInfo.classGroupId.toString());
  }

  const courseIds = new Set(enrolledCourses.map((c) => c._id.toString()));

  if (classGroupIds.size) {
    const linkedGroups = await ClassGroup.find({
      _id: { $in: Array.from(classGroupIds) },
    })
      .select('courseId')
      .lean();
    linkedGroups.forEach((g) => {
      if (g.courseId) courseIds.add(g.courseId.toString());
    });
  }

  return {
    userId: userIdStr,
    courseIds: Array.from(courseIds),
    classGroupIds: Array.from(classGroupIds),
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

module.exports = {
  getStudentVisibilityContext,
  buildStudentClassVisibilityFilter,
  getStudentVisibleClassFilter,
  studentCanAccessClass,
  enrollClassGroupStudentsInSession,
};
