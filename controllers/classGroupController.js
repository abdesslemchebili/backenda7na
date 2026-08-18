const ClassGroup = require('../models/ClassGroup');
const Language = require('../models/Language');
const Level = require('../models/Level');
const Book = require('../models/Book');
const User = require('../models/User');
const { syncClassGroupStudents } = require('../utils/studentClassVisibility');

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

  const language = g.languageId && g.languageId._id
    ? {
        _id: g.languageId._id,
        name: g.languageId.name,
        code: g.languageId.code,
        nativeName: g.languageId.nativeName,
      }
    : undefined;

  const levelDoc = g.levelId && g.levelId._id
    ? {
        _id: g.levelId._id,
        code: g.levelId.code,
        name: g.levelId.name,
      }
    : undefined;

  const book = g.bookId && g.bookId._id
    ? {
        _id: g.bookId._id,
        title: g.bookId.title,
      }
    : undefined;

  return {
    _id: g._id,
    name: g.name,
    description: g.description,
    languageId: g.languageId
      ? (g.languageId._id ? g.languageId._id.toString() : g.languageId.toString())
      : undefined,
    language,
    levelId: g.levelId
      ? (g.levelId._id ? g.levelId._id.toString() : g.levelId.toString())
      : undefined,
    levelDoc,
    bookId: g.bookId
      ? (g.bookId._id ? g.bookId._id.toString() : g.bookId.toString())
      : undefined,
    book,
    level: g.level || undefined,
    subLevel: g.subLevel || undefined,
    capacity: g.capacity,
    schedule: g.schedule || undefined,
    startDate: g.startDate || undefined,
    endDate: g.endDate || undefined,
    professorId: prof._id ? prof._id.toString() : prof.toString(),
    professor: formatUserDoc(prof),
    studentIds: studs.map((s) => (s._id ? s._id.toString() : s.toString())),
    students: studs.map(formatUserDoc),
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  };
}

const populatePaths = [
  { path: 'professorId', select: userPublicFields },
  { path: 'studentIds', select: userPublicFields },
  { path: 'languageId', select: 'name code nativeName icon' },
  { path: 'levelId', select: 'code name order' },
  { path: 'bookId', select: 'title' },
];

async function populateGroupDoc(doc) {
  if (!doc) return null;
  const g = await ClassGroup.findById(doc._id || doc)
    .populate(populatePaths)
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

async function validateLanguageLevelBook({ languageId, levelId, bookId }) {
  if (!languageId) {
    return { error: 'languageId is required' };
  }
  const language = await Language.findById(languageId);
  if (!language) {
    return { error: 'Language not found' };
  }
  if (levelId) {
    const level = await Level.findById(levelId);
    if (!level) return { error: 'Level not found' };
    if (level.language.toString() !== languageId.toString()) {
      return { error: 'Level does not belong to the selected language' };
    }
  }
  if (bookId) {
    const book = await Book.findById(bookId);
    if (!book) return { error: 'Book not found' };
  }
  return { language };
}

// GET /api/class-groups
const list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.user.role === 'professor') {
      filters.professorId = req.user._id;
    } else if (req.user.role === 'student') {
      filters.studentIds = req.user._id;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    } else if (req.query.includeArchived !== 'true' && req.user.role !== 'admin') {
      filters.status = { $ne: 'archived' };
    }
    if (req.query.languageId) filters.languageId = req.query.languageId;

    const [raw, total] = await Promise.all([
      ClassGroup.find(filters)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(populatePaths)
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
    const {
      name,
      description,
      languageId,
      levelId,
      bookId,
      professorId,
      studentIds = [],
      status = 'active',
      level,
      subLevel,
      capacity,
      schedule,
      startDate,
      endDate,
    } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'ValidationError', message: 'name is required' });
    }

    const langCheck = await validateLanguageLevelBook({ languageId, levelId, bookId });
    if (langCheck.error) {
      return res.status(400).json({ error: 'ValidationError', message: langCheck.error });
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

    const group = await ClassGroup.create({
      name: name.trim(),
      description: description ? String(description).trim() : undefined,
      languageId,
      levelId: levelId || null,
      bookId: bookId || null,
      professorId: pid,
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      status: status === 'archived' ? 'archived' : 'active',
      level: level || null,
      subLevel: subLevel || null,
      capacity: capacity ? Number(capacity) : undefined,
      schedule: schedule || undefined,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    await syncClassGroupStudents(group).catch((err) => {
      console.error('syncClassGroupStudents create:', err.message);
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

    const {
      name,
      description,
      languageId,
      levelId,
      bookId,
      professorId,
      studentIds,
      status,
      level,
      subLevel,
      capacity,
      schedule,
      startDate,
      endDate,
    } = req.body;

    if (name !== undefined) group.name = String(name).trim();
    if (description !== undefined) group.description = description ? String(description).trim() : '';
    if (status !== undefined && ['active', 'archived'].includes(status)) group.status = status;
    if (level !== undefined) group.level = level || null;
    if (subLevel !== undefined) group.subLevel = subLevel || null;
    if (capacity !== undefined) group.capacity = Number(capacity) || group.capacity;
    if (schedule !== undefined) group.schedule = schedule;
    if (startDate !== undefined) group.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) group.endDate = endDate ? new Date(endDate) : null;

    if (req.user.role === 'admin' && professorId) {
      const prof = await User.findById(professorId);
      if (!prof || prof.role !== 'professor') {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid professor' });
      }
      group.professorId = professorId;
    }

    const nextLanguageId = languageId !== undefined ? languageId : group.languageId;
    const nextLevelId = levelId !== undefined ? (levelId || null) : group.levelId;
    const nextBookId = bookId !== undefined ? (bookId || null) : group.bookId;

    if (languageId !== undefined || levelId !== undefined || bookId !== undefined) {
      const langCheck = await validateLanguageLevelBook({
        languageId: nextLanguageId,
        levelId: nextLevelId,
        bookId: nextBookId,
      });
      if (langCheck.error) {
        return res.status(400).json({ error: 'ValidationError', message: langCheck.error });
      }
      if (languageId !== undefined) group.languageId = languageId;
      if (levelId !== undefined) group.levelId = levelId || null;
      if (bookId !== undefined) group.bookId = bookId || null;
    }

    if (studentIds !== undefined) {
      group.studentIds = Array.isArray(studentIds) ? studentIds : [];
    }

    await group.save();
    await syncClassGroupStudents(group).catch((err) => {
      console.error('syncClassGroupStudents update:', err.message);
    });
    const out = await populateGroupDoc(group);
    res.json(out);
  } catch (err) {
    console.error('classGroup update:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { list, create, getById, update };
