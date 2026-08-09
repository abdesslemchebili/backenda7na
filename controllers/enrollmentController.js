const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');

function formatEnrollment(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: o._id,
    student: o.student?._id ? o.student._id.toString() : o.student?.toString?.(),
    studentDoc: o.student?._id
      ? {
          _id: o.student._id,
          firstName: o.student.firstName,
          lastName: o.student.lastName,
          email: o.student.email,
        }
      : undefined,
    course: o.course?._id ? o.course._id.toString() : o.course?.toString?.(),
    courseDoc: o.course?._id
      ? {
          _id: o.course._id,
          title: o.course.title,
          language: o.course.language,
          level: o.course.level,
          cefrLevel: o.course.cefrLevel,
        }
      : undefined,
    enrolledAt: o.enrolledAt,
    status: o.status,
    progress: o.progress,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function canManageEnrollment(req, course) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'professor' && course.professor.toString() === req.user._id.toString()) {
    return true;
  }
  return false;
}

// GET /api/enrollments
const listEnrollments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.courseId) filters.course = req.query.courseId;

    if (req.user.role === 'student') {
      filters.student = req.user._id;
    } else if (req.query.studentId) {
      filters.student = req.query.studentId;
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id }).select('_id').lean();
      filters.course = { $in: courses.map((c) => c._id) };
    }

    const [rows, total] = await Promise.all([
      Enrollment.find(filters)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('student', 'firstName lastName email role')
        .populate('course', 'title language level cefrLevel professor')
        .lean(),
      Enrollment.countDocuments(filters),
    ]);

    res.json({
      data: rows.map(formatEnrollment),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error('listEnrollments:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/enrollments — admin/prof enroll a student
const createEnrollment = async (req, res) => {
  try {
    const { studentId, courseId, status = 'active' } = req.body;
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'ValidationError', message: 'studentId and courseId are required' });
    }

    const [student, course] = await Promise.all([
      User.findById(studentId),
      Course.findById(courseId),
    ]);

    if (!student || student.role !== 'student') {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid student' });
    }
    if (!course) {
      return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    }
    if (!canManageEnrollment(req, course)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed to enroll students in this course' });
    }

    const existingActive = await Enrollment.findOne({
      student: studentId,
      course: courseId,
      status: 'active',
    });
    if (existingActive) {
      return res.status(400).json({ error: 'ValidationError', message: 'Student already has an active enrollment' });
    }

    const alreadyInCourse = course.enrolledStudents.some(
      (e) => e.student.toString() === studentId.toString()
    );
    if (!alreadyInCourse) {
      await course.enrollStudent(studentId);
      await User.findByIdAndUpdate(studentId, { $addToSet: { 'studentInfo.enrolledCourses': courseId } });
    }

    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
      status: ['active', 'completed', 'withdrawn', 'pending'].includes(status) ? status : 'active',
    });

    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title language level cefrLevel')
      .lean();

    res.status(201).json(formatEnrollment(populated));
  } catch (err) {
    console.error('createEnrollment:', err);
    if (err.message?.includes('déjà inscrit') || err.message?.includes('complet')) {
      return res.status(400).json({ error: 'ValidationError', message: err.message });
    }
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/enrollments/:id
const updateEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id).populate('course');
    if (!enrollment) {
      return res.status(404).json({ error: 'NotFound', message: 'Enrollment not found' });
    }

    const course = enrollment.course;
    const isOwner = enrollment.student.toString() === req.user._id.toString();
    if (!isOwner && !canManageEnrollment(req, course)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const { status, progress } = req.body;
    if (status !== undefined) {
      if (!['active', 'completed', 'withdrawn', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid status' });
      }
      enrollment.status = status;

      if (status === 'withdrawn' && req.user.role !== 'student') {
        await course.unenrollStudent(enrollment.student);
        await User.findByIdAndUpdate(enrollment.student, {
          $pull: { 'studentInfo.enrolledCourses': course._id },
        });
      }
    }

    if (progress !== undefined) {
      if (req.user.role === 'student') {
        return res.status(403).json({ error: 'Forbidden', message: 'Students cannot update progress directly' });
      }
      enrollment.progress = Math.min(100, Math.max(0, Number(progress) || 0));
      await course.updateStudentProgress(enrollment.student, enrollment.progress);
    }

    await enrollment.save();
    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title language level cefrLevel')
      .lean();

    res.json(formatEnrollment(populated));
  } catch (err) {
    console.error('updateEnrollment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { listEnrollments, createEnrollment, updateEnrollment, formatEnrollment };
