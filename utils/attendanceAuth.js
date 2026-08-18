const ClassGroup = require('../models/ClassGroup');
const Class = require('../models/Class');

async function professorOwnsClassGroup(professorId, classGroupId) {
  const group = await ClassGroup.findById(classGroupId).select('professorId');
  if (!group) return false;
  return group.professorId && group.professorId.toString() === professorId.toString();
}

/** @deprecated alias */
const professorOwnsCourse = professorOwnsClassGroup;

async function professorTeachesStudent(professorId, studentId) {
  const match = await ClassGroup.findOne({
    professorId,
    studentIds: studentId,
  }).select('_id');
  return !!match;
}

async function studentEnrolledInClass(studentId, classDoc) {
  const sid = studentId.toString();

  if (
    (classDoc.enrolledStudents || []).some(
      (e) => e.student && e.student.toString() === sid
    )
  ) {
    return true;
  }

  if (classDoc.classGroupId) {
    const group = await ClassGroup.findById(classDoc.classGroupId).select('studentIds');
    if ((group?.studentIds || []).some((id) => id && id.toString() === sid)) {
      return true;
    }
  }

  return false;
}

async function assertExportAccess(req, { classGroupId, courseId, classId }) {
  const groupId = classGroupId || courseId;
  if (req.user.role === 'admin') return { ok: true };

  if (req.user.role !== 'professor') {
    return { ok: false, status: 403, message: 'Not authorized' };
  }

  if (groupId) {
    const allowed = await professorOwnsClassGroup(req.user._id, groupId);
    return allowed
      ? { ok: true }
      : { ok: false, status: 403, message: 'Not authorized for this class group' };
  }

  if (classId) {
    const classDoc = await Class.findById(classId).select('classGroupId professor');
    if (!classDoc) return { ok: false, status: 404, message: 'Class not found' };
    const ownsGroup = classDoc.classGroupId
      ? await professorOwnsClassGroup(req.user._id, classDoc.classGroupId)
      : false;
    const isClassProfessor =
      classDoc.professor && classDoc.professor.toString() === req.user._id.toString();
    if (ownsGroup || isClassProfessor) return { ok: true };
    return { ok: false, status: 403, message: 'Not authorized for this class' };
  }

  return { ok: false, status: 403, message: 'Not authorized' };
}

module.exports = {
  professorOwnsClassGroup,
  professorOwnsCourse,
  professorTeachesStudent,
  studentEnrolledInClass,
  assertExportAccess,
};
