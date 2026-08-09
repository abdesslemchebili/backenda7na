const path = require('path');
const fs = require('fs');
const Material = require('../models/Material');
const Chapter = require('../models/Chapter');
const Book = require('../models/Book');
const Course = require('../models/Course');
const { MATERIAL_TYPES } = require('../models/Material');
const { buildSignedFileUrl, getSignedUrlExpiryIso } = require('../utils/fileAccess');
const { pickLocalizedTitle } = require('./bookController');

function formatMaterial(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: o._id,
    type: o.type,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    fileUrl: o.fileUrl,
    externalUrl: o.externalUrl,
    language: o.language,
    level: o.level,
    course: o.course,
    book: o.book,
    chapter: o.chapter,
    duration: o.duration,
    transcript: o.transcript,
    order: o.order,
    size: o.size,
    active: o.active,
    uploadedBy: o.uploadedBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function canAccessMaterial(req, material) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (!material.active) return false;

  if (material.course) {
    const course = await Course.findById(material.course).select('professor enrolledStudents');
    if (!course) return false;
    if (course.professor.toString() === req.user._id.toString()) return true;
    return course.enrolledStudents.some((e) => e.student?.toString() === req.user._id.toString());
  }

  if (material.book) {
    const book = await Book.findById(material.book).select('status active');
    if (!book || book.status !== 'published' || !book.active) return false;
    if (req.user.role === 'student') {
      const enrolled = await Course.findOne({
        bookId: material.book,
        'enrolledStudents.student': req.user._id,
      }).select('_id');
      return !!enrolled;
    }
    return true;
  }

  return material.type === 'link' && material.externalUrl;
}

// GET /api/materials
const listMaterials = async (req, res) => {
  try {
    const filters = {};
    if (req.query.bookId) filters.book = req.query.bookId;
    if (req.query.chapterId) filters.chapter = req.query.chapterId;
    if (req.query.courseId) filters.course = req.query.courseId;
    if (req.query.type) filters.type = req.query.type;
    if (req.user?.role !== 'admin') filters.active = true;

    const materials = await Material.find(filters).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ data: materials.map(formatMaterial) });
  } catch (err) {
    console.error('listMaterials:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/materials — JSON or multipart
const createMaterial = async (req, res) => {
  try {
    const {
      type,
      title,
      externalUrl,
      languageId,
      levelId,
      courseId,
      bookId,
      chapterId,
      duration,
      transcript,
      order = 0,
    } = req.body;

    if (!type || !MATERIAL_TYPES.includes(type)) {
      return res.status(400).json({ error: 'ValidationError', message: `type must be one of: ${MATERIAL_TYPES.join(', ')}` });
    }

    const titleObj =
      typeof title === 'string'
        ? { fr: title.trim(), en: title.trim(), ar: '' }
        : title;

    let fileUrl = null;
    let size = 0;

    if (req.file) {
      if (type === 'audio') {
        fileUrl = `/uploads/audio/${req.file.filename}`;
      } else {
        fileUrl = `/uploads/documents/${req.file.filename}`;
      }
      size = req.file.size || 0;
    } else if (['pdf', 'audio', 'document', 'video'].includes(type) && !externalUrl) {
      return res.status(400).json({ error: 'ValidationError', message: 'file or externalUrl is required' });
    }

    if (chapterId) {
      const chapter = await Chapter.findById(chapterId);
      if (!chapter) {
        return res.status(404).json({ error: 'NotFound', message: 'Chapter not found' });
      }
    }

    const parsedTitle =
      typeof title === 'string' && title.startsWith('{')
        ? JSON.parse(title)
        : titleObj;

    const material = await Material.create({
      type,
      title: parsedTitle,
      fileUrl,
      externalUrl: externalUrl || null,
      language: languageId || null,
      level: levelId || null,
      course: courseId || null,
      book: bookId || null,
      chapter: chapterId || null,
      duration: duration != null ? Number(duration) : null,
      transcript: transcript || null,
      order: Number(order) || 0,
      size,
      uploadedBy: req.user._id,
    });

    res.status(201).json(formatMaterial(material));
  } catch (err) {
    console.error('createMaterial:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/materials/:id
const updateMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ error: 'NotFound', message: 'Material not found' });
    }

    const { title, externalUrl, duration, transcript, order, active } = req.body;
    if (title !== undefined) {
      material.title = typeof title === 'string' ? { fr: title, en: title, ar: material.title?.ar || '' } : title;
    }
    if (externalUrl !== undefined) material.externalUrl = externalUrl;
    if (duration !== undefined) material.duration = duration != null ? Number(duration) : null;
    if (transcript !== undefined) material.transcript = transcript;
    if (order !== undefined) material.order = Number(order) || 0;
    if (active !== undefined) material.active = Boolean(active);

    await material.save();
    res.json(formatMaterial(material));
  } catch (err) {
    console.error('updateMaterial:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/materials/:id
const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ error: 'NotFound', message: 'Material not found' });
    }
    material.active = false;
    await material.save();
    res.json({ message: 'Material deactivated', id: material._id });
  } catch (err) {
    console.error('deleteMaterial:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/materials/:id/download
const downloadMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id).lean();
    if (!material) {
      return res.status(404).json({ error: 'NotFound', message: 'Material not found' });
    }

    const allowed = await canAccessMaterial(req, material);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    if (material.externalUrl && !material.fileUrl) {
      return res.json({ url: material.externalUrl, external: true });
    }
    if (!material.fileUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'File not available' });
    }

    const url = buildSignedFileUrl(material.fileUrl, req.user._id, req);
    const ext = path.extname(material.fileUrl) || '';
    res.json({
      url,
      expiresAt: getSignedUrlExpiryIso(),
      filename: `${pickLocalizedTitle(material.title).replace(/[^\w\s-]/g, '') || 'material'}${ext}`,
    });
  } catch (err) {
    console.error('downloadMaterial:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  downloadMaterial,
  formatMaterial,
};
