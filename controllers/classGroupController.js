const ClassGroup = require('../models/ClassGroup');
const Course = require('../models/Course');
const User = require('../models/User');

const userPublicFields = 'firstName lastName email role status phone avatar bio preferences createdAt updatedAt';

function formatUserDoc(u) {
  if (!u) return undefined;
  const o = u.toObject ? u.toObject() : u;
  return {
    _id: o._id,
    firstName: o.firstName,
    lastName: o.lastName,
    email: o.email,
    role: o.role,
    status: o.status,
    phone: o.phone || undefined,
    avatar: o.avatar || undefined,
    bio: o.bio || { en: '', fr: '', ar: '' },
    preferences: o.preferences,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}

function formatLeanGroup(g) {
  if (!g) return null;
  const prof = g.professorId;
  const studs = g.studentIds || [];
  const course = g.courseId && g.courseId._id
    ? {
        _id: g.courseId._id,
        title: g.courseId.title,
        language: g.courseId.language,
        level: g.courseId.level
      }
    : undefined;

  return {
    _id: g._id,
    name: g.name,
    description: g.description,
    courseId: g.courseId ? g.courseId._id.toString() : undefined,
    course,
    professorId: prof._id ? prof._id.toString() : prof.toString(),
    professor: formatUserDoc(prof),
    studentIds: studs.map((s) => (s._id ? s._id.toString() : s.toString())),
    students: studs.map(formatUserDoc),
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  };
}

async function populateGroupDoc(doc) {
  if (!doc) return null;
  const g = await ClassGroup.findById(doc._id || doc)
    .populate('professorId', userPublicFields)
    .populate('studentIds', userPublicFields)
    .populate({
      path: 'courseId',
      select: 'title language level'
    })
    .lean();

  return formatLeanGroup(g);
}

function canReadGroup(req, group) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'professor' && group.professorId.toString() === req.user._id.toString()) return true;
  if (req.user.role === 'student') {
    return (group.studentIds || []).some((id) => id.toString() === req.user._id.toString());
  }
  return false;
}

// GET /api/class-groups
const list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.user.role === 'professor') {
      filters.professorId = req.user._id;
    } else if (req.user.role === 'student') {
      filters.studentIds = req.user._id;
    }

    const [raw, total] = await Promise.all([
      ClassGroup.find(filters)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('professorId', userPublicFields)
        .populate('studentIds', userPublicFields)
        .populate({ path: 'courseId', select: 'title language level' })
        .lean(),
      ClassGroup.countDocuments(filters)
    ]);

    const data = raw.map(formatLeanGroup);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error('classGroup list:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/class-groups
const create = async (req, res) => {
  try {
    const { name, description, courseId, professorId, studentIds = [], status = 'active' } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'ValidationError', message: 'name is required' });
    }

    let pid;
    if (req.user.role === 'admin') {
      if (!professorId) {
        return res.status(400).json({ error: 'ValidationError', message: 'professorId is required' });
      }
      pid = professorId;
    } else if (req.user.role === 'professor') {
      pid = req.user._id;
    } else {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    const prof = await User.findById(pid);
    if (!prof || prof.role !== 'professor') {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid professor' });
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(400).json({ error: 'NotFound', message: 'Course not found' });
      }
      if (course.professor.toString() !== pid.toString()) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Course professor must match cohort professor'
        });
      }
    }

    const group = await ClassGroup.create({
      name: name.trim(),
      description: description ? String(description).trim() : undefined,
      courseId: courseId || null,
      professorId: pid,
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      status: status === 'archived' ? 'archived' : 'active'
    });

    const out = await populateGroupDoc(group);
    res.status(201).json(out);
  } catch (err) {
    console.error('classGroup create:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/class-groups/:id
const getById = async (req, res) => {
  try {
    const group = await ClassGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    }
    if (!canReadGroup(req, group)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed to view this cohort' });
    }
    const out = await populateGroupDoc(group);
    res.json(out);
  } catch (err) {
    console.error('classGroup getById:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/class-groups/:id
const update = async (req, res) => {
  try {
    const group = await ClassGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    }

    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students cannot update cohorts' });
    }
    if (req.user.role === 'professor' && group.professorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own cohorts' });
    }

    const { name, description, courseId, professorId, studentIds, status } = req.body;

    if (name !== undefined) group.name = String(name).trim();
    if (description !== undefined) group.description = description ? String(description).trim() : '';
    if (status !== undefined && ['active', 'archived'].includes(status)) group.status = status;

    if (req.user.role === 'admin' && professorId) {
      const prof = await User.findById(professorId);
      if (!prof || prof.role !== 'professor') {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid professor' });
      }
      group.professorId = professorId;
    }

    if (courseId !== undefined) {
      if (!courseId) {
        group.courseId = null;
      } else {
        const course = await Course.findById(courseId);
        if (!course) return res.status(400).json({ error: 'NotFound', message: 'Course not found' });
        if (course.professor.toString() !== group.professorId.toString()) {
          return res.status(400).json({
            error: 'ValidationError',
            message: 'Course professor must match cohort professor'
          });
        }
        group.courseId = courseId;
      }
    }

    if (studentIds !== undefined) {
      group.studentIds = Array.isArray(studentIds) ? studentIds : [];
    }

    await group.save();
    const out = await populateGroupDoc(group);
    res.json(out);
  } catch (err) {
    console.error('classGroup update:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { list, create, getById, update };
