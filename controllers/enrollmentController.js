const Enrollment = require('../models/Enrollment');
const ClassGroup = require('../models/ClassGroup');
const User = require('../models/User');
const { ensureStudentInClassGroup } = require('../utils/groupEnrollment');

function formatEnrollment(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const groupId = o.classGroup?._id
    ? o.classGroup._id.toString()
    : o.classGroup?.toString?.();
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
    classGroupId: groupId,
    classGroup: groupId,
    classGroupDoc: o.classGroup?._id
      ? {
          _id: o.classGroup._id,
          name: o.classGroup.name,
          languageId: o.classGroup.languageId,
          levelId: o.classGroup.levelId,
          level: o.classGroup.level,
          subLevel: o.classGroup.subLevel,
        }
      : undefined,
    enrolledAt: o.enrolledAt,
    status: o.status,
    progress: o.progress,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function canManageEnrollment(req, group) {
  if (req.user.role === 'admin') return true;
  if (
    req.user.role === 'professor' &&
    group.professorId &&
    group.professorId.toString() === req.user._id.toString()
  ) {
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
    const classGroupId = req.query.classGroupId || req.query.courseId;
    if (classGroupId) filters.classGroup = classGroupId;

    if (req.user.role === 'student') {
      filters.student = req.user._id;
    } else if (req.query.studentId) {
      filters.student = req.query.studentId;
    } else if (req.user.role === 'professor') {
      const groups = await ClassGroup.find({ professorId: req.user._id }).select('_id').lean();
      filters.classGroup = { $in: groups.map((g) => g._id) };
    }

    const [rows, total] = await Promise.all([
      Enrollment.find(filters)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('student', 'firstName lastName email role')
        .populate('classGroup', 'name languageId levelId level subLevel professorId')
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

// POST /api/enrollments
const createEnrollment = async (req, res) => {
  try {
    const {
      studentId,
      classGroupId,
      courseId,
      status = 'active',
    } = req.body;
    const groupId = classGroupId || courseId;
    if (!studentId || !groupId) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'studentId and classGroupId are required',
      });
    }

    const [student, group] = await Promise.all([
      User.findById(studentId),
      ClassGroup.findById(groupId),
    ]);

    if (!student || student.role !== 'student') {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid student' });
    }
    if (!group) {
      return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    }
    if (!canManageEnrollment(req, group)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Not allowed to enroll students in this class group',
      });
    }

    const existingActive = await Enrollment.findOne({
      student: studentId,
      classGroup: groupId,
      status: 'active',
    });
    if (existingActive) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Student already has an active enrollment',
      });
    }

    await ensureStudentInClassGroup(studentId, group);

    if (status !== 'active') {
      await Enrollment.findOneAndUpdate(
        { student: studentId, classGroup: groupId },
        { status: ['active', 'completed', 'withdrawn', 'pending'].includes(status) ? status : 'active' }
      );
    }

    const populated = await Enrollment.findOne({
      student: studentId,
      classGroup: groupId,
    })
      .populate('student', 'firstName lastName email')
      .populate('classGroup', 'name languageId levelId level subLevel')
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
    const enrollment = await Enrollment.findById(req.params.id).populate('classGroup');
    if (!enrollment) {
      return res.status(404).json({ error: 'NotFound', message: 'Enrollment not found' });
    }

    const group = enrollment.classGroup;
    const isOwner = enrollment.student.toString() === req.user._id.toString();
    if (!isOwner && !canManageEnrollment(req, group)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const { status, progress } = req.body;
    if (status !== undefined) {
      if (!['active', 'completed', 'withdrawn', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid status' });
      }
      enrollment.status = status;

      if (status === 'withdrawn' && req.user.role !== 'student') {
        await ClassGroup.findByIdAndUpdate(group._id, {
          $pull: { studentIds: enrollment.student },
        });
        const student = await User.findById(enrollment.student).select(
          'studentInfo.classGroupId'
        );
        const pullUpdate = {
          $pull: { 'studentInfo.enrolledGroups': group._id },
        };
        if (
          student?.studentInfo?.classGroupId &&
          student.studentInfo.classGroupId.toString() === group._id.toString()
        ) {
          pullUpdate.$unset = { 'studentInfo.classGroupId': 1 };
        }
        await User.findByIdAndUpdate(enrollment.student, pullUpdate);
      }
    }

    if (progress !== undefined) {
      if (req.user.role === 'student') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Students cannot update progress directly',
        });
      }
      enrollment.progress = Math.min(100, Math.max(0, Number(progress) || 0));
    }

    await enrollment.save();
    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'firstName lastName email')
      .populate('classGroup', 'name languageId levelId level subLevel')
      .lean();

    res.json(formatEnrollment(populated));
  } catch (err) {
    console.error('updateEnrollment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listEnrollments,
  createEnrollment,
  updateEnrollment,
  formatEnrollment,
};
