const Course = require('../models/Course');
const Class = require('../models/Class');

async function professorOwnsCourse(professorId, courseId) {
  const course = await Course.findById(courseId).select('professor');
  if (!course) return false;
  return course.professor.toString() === professorId.toString();
}

async function professorTeachesStudent(professorId, studentId) {
  const courses = await Course.find({ professor: professorId }).select('_id');
  if (!courses.length) return false;
  const courseIds = courses.map((c) => c._id);
  const match = await Course.findOne({
    _id: { $in: courseIds },
    'enrolledStudents.student': studentId
  }).select('_id');
  return !!match;
}

async function studentEnrolledInClass(studentId, classDoc) {
  const course = await Course.findById(classDoc.course).select('enrolledStudents');
  if (!course) return false;
  return course.enrolledStudents.some(
    (e) => e.student && e.student.toString() === studentId.toString()
  );
}

async function assertExportAccess(req, { courseId, classId }) {
  if (req.user.role === 'admin') return { ok: true };

  if (req.user.role !== 'professor') {
    return { ok: false, status: 403, message: 'Not authorized' };
  }

  if (courseId) {
    const allowed = await professorOwnsCourse(req.user._id, courseId);
    return allowed ? { ok: true } : { ok: false, status: 403, message: 'Not authorized for this course' };
  }

  if (classId) {
    const classDoc = await Class.findById(classId).select('course professor');
    if (!classDoc) return { ok: false, status: 404, message: 'Class not found' };
    const ownsCourse = await professorOwnsCourse(req.user._id, classDoc.course);
    const isClassProfessor = classDoc.professor && classDoc.professor.toString() === req.user._id.toString();
    if (ownsCourse || isClassProfessor) return { ok: true };
    return { ok: false, status: 403, message: 'Not authorized for this class' };
  }

  return { ok: false, status: 403, message: 'Not authorized' };
}

module.exports = {
  professorOwnsCourse,
  professorTeachesStudent,
  studentEnrolledInClass,
  assertExportAccess
};
