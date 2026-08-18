const ClassGroup = require('../models/ClassGroup');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

/**
 * Assure qu'un étudiant est membre de la cohorte (studentIds + profil + Enrollment).
 * Idempotent.
 */
async function ensureStudentInClassGroup(userId, classGroup) {
  if (!classGroup?._id) {
    return { enrolled: false, reason: 'no_class_group' };
  }

  const userIdStr = userId.toString();
  const groupId = classGroup._id;
  const alreadyMember = (classGroup.studentIds || []).some(
    (id) => id && id.toString() === userIdStr
  );

  if (!alreadyMember) {
    if (classGroup.capacity && (classGroup.studentIds || []).length >= classGroup.capacity) {
      return { enrolled: false, reason: 'group_full', classGroupId: groupId };
    }
    await ClassGroup.findByIdAndUpdate(groupId, {
      $addToSet: { studentIds: userId },
    });
  }

  await User.findByIdAndUpdate(userId, {
    'studentInfo.classGroupId': groupId,
    $addToSet: { 'studentInfo.enrolledGroups': groupId },
  });

  await Enrollment.findOneAndUpdate(
    { student: userId, classGroup: groupId, status: 'active' },
    {
      $setOnInsert: {
        student: userId,
        classGroup: groupId,
        status: 'active',
        enrolledAt: new Date(),
        progress: 0,
      },
    },
    { upsert: true, new: true }
  );

  return { enrolled: !alreadyMember, classGroupId: groupId };
}

/**
 * Inscrit un étudiant à sa cohorte assignée (studentInfo.classGroupId).
 */
async function enrollStudentFromAssignedClassGroup(userId) {
  const user = await User.findById(userId).select('studentInfo');
  if (!user?.studentInfo?.classGroupId) {
    return { enrolled: false, reason: 'no_class_group' };
  }

  const group = await ClassGroup.findById(user.studentInfo.classGroupId);
  if (!group) {
    return { enrolled: false, reason: 'class_group_not_found' };
  }

  return ensureStudentInClassGroup(userId, group);
}

/** @deprecated alias — kept for call-site compatibility during migration */
const enrollStudentInCourseFromClassGroup = ensureStudentInClassGroup;

module.exports = {
  ensureStudentInClassGroup,
  enrollStudentFromAssignedClassGroup,
  enrollStudentInCourseFromClassGroup,
};
