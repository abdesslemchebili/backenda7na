const Course = require('../models/Course');
const User = require('../models/User');
const ClassGroup = require('../models/ClassGroup');

/**
 * Inscrit un étudiant au cours lié à sa cohorte (ClassGroup.courseId).
 * Idempotent : ne fait rien si déjà inscrit ou pas de cours lié.
 */
async function enrollStudentInCourseFromClassGroup(userId, classGroup) {
  if (!classGroup?.courseId) {
    return { enrolled: false, reason: 'no_course_linked' };
  }

  const course = await Course.findById(classGroup.courseId);
  if (!course) {
    return { enrolled: false, reason: 'course_not_found' };
  }

  const userIdStr = userId.toString();
  const alreadyEnrolled = course.enrolledStudents.some(
    (e) => e.student && e.student.toString() === userIdStr
  );

  if (alreadyEnrolled) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { 'studentInfo.enrolledCourses': course._id }
    });
    return { enrolled: false, reason: 'already_enrolled', courseId: course._id };
  }

  if (course.maxStudents && course.enrolledStudents.length >= course.maxStudents) {
    return { enrolled: false, reason: 'course_full', courseId: course._id };
  }

  await course.enrollStudent(userId);
  await User.findByIdAndUpdate(userId, {
    $addToSet: { 'studentInfo.enrolledCourses': course._id }
  });

  return { enrolled: true, courseId: course._id };
}

/**
 * Inscrit un étudiant au cours de sa cohorte assignée (studentInfo.classGroupId).
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

  return enrollStudentInCourseFromClassGroup(userId, group);
}

module.exports = {
  enrollStudentInCourseFromClassGroup,
  enrollStudentFromAssignedClassGroup
};
