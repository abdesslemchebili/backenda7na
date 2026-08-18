const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const ClassGroup = require('../models/ClassGroup');
const { buildSignedFileUrl, getSignedUrlExpiryIso } = require('../utils/fileAccess');

function isGroupProfessor(group, userId) {
  return group?.professorId && group.professorId.toString() === userId.toString();
}

function isGroupStudent(group, userId) {
  return (group?.studentIds || []).some((id) => id && id.toString() === userId.toString());
}

async function assertGroupAccess(req, classGroupId, { write = false } = {}) {
  const group = await ClassGroup.findById(classGroupId);
  if (!group) {
    return { error: { status: 404, body: { error: 'NotFound', message: 'Class group not found' } } };
  }
  const isProfessor = req.user.role === 'professor' && isGroupProfessor(group, req.user._id);
  const isAdmin = req.user.role === 'admin';
  const isMember = isGroupStudent(group, req.user._id);

  if (write) {
    if (!isProfessor && !isAdmin) {
      return {
        error: {
          status: 403,
          body: { error: 'Forbidden', message: 'Not authorized to upload to this class group' },
        },
      };
    }
  } else if (!isProfessor && !isAdmin && !isMember) {
    return {
      error: {
        status: 403,
        body: { error: 'Forbidden', message: 'Not authorized to view these documents' },
      },
    };
  }

  return { group };
}

// POST /api/class-groups/:classGroupId/documents
const uploadDocument = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await assertGroupAccess(req, classGroupId, { write: true });
    if (access.error) return res.status(access.error.status).json(access.error.body);

    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'File is required' });
    }
    const titleEn = req.body.title || req.file.originalname || 'Document';
    const typeMap = { '.pdf': 'pdf', '.doc': 'doc', '.docx': 'doc', '.ppt': 'ppt', '.pptx': 'ppt' };
    const ext = path.extname(req.file.originalname).toLowerCase();
    const docType = req.body.type || typeMap[ext] || 'other';
    const relativePath = `/uploads/documents/${req.file.filename}`;
    const doc = new Document({
      title: { en: titleEn, fr: '', ar: '' },
      url: relativePath,
      type: docType,
      size: req.file.size || 0,
      classGroup: classGroupId,
      uploadedBy: req.user._id,
    });
    await doc.save();
    res.status(201).json({
      _id: doc._id,
      title: doc.title,
      url: doc.url,
      type: doc.type,
      size: doc.size,
      classGroupId,
      classGroup: classGroupId,
      uploadedBy: req.user._id,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error('uploadDocument:', err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/class-groups/:classGroupId/documents
const listByClassGroup = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await assertGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const { page = 1, limit = 20, type, search } = req.query;
    const filter = { classGroup: classGroupId };
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { 'title.en': { $regex: search, $options: 'i' } },
        { 'title.fr': { $regex: search, $options: 'i' } },
        { 'title.ar': { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const [data, total] = await Promise.all([
      Document.find(filter)
        .populate('uploadedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Document.countDocuments(filter),
    ]);
    res.json({
      data,
      pagination: {
        page: Math.max(1, parseInt(page)),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('listByClassGroup:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/** @deprecated alias */
const listByCourse = listByClassGroup;

// GET /api/documents/:id/download
const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('classGroup');
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Document not found' });
    }
    const group = doc.classGroup;
    if (!group) {
      return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    }
    const isProfessor = req.user.role === 'professor' && isGroupProfessor(group, req.user._id);
    const isAdmin = req.user.role === 'admin';
    const isMember = isGroupStudent(group, req.user._id);
    if (!isProfessor && !isAdmin && !isMember) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const filename =
      doc.title && doc.title.en
        ? `${doc.title.en}.${doc.type || 'pdf'}`
        : doc.url.split('/').pop() || 'document';
    const url = buildSignedFileUrl(doc.url, req.user._id, req);
    res.json({
      url,
      expiresAt: getSignedUrlExpiryIso(),
      filename,
    });
  } catch (err) {
    console.error('downloadDocument:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/documents/:id
const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('classGroup');
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Document not found' });
    }
    const group = doc.classGroup;
    if (
      req.user.role === 'professor' &&
      !isGroupProfessor(group, req.user._id) &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Not authorized to delete this document',
      });
    }
    if (req.user.role !== 'admin' && req.user.role !== 'professor') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('deleteDocument:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/upload or /api/upload/image - generic image upload
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'File is required' });
    }
    const relativePath = `/uploads/images/${req.file.filename}`;
    res.json({
      url: relativePath,
      signedUrl: buildSignedFileUrl(relativePath, req.user._id, req),
    });
  } catch (err) {
    console.error('uploadImage:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  uploadDocument,
  listByClassGroup,
  listByCourse,
  downloadDocument,
  deleteDocument,
  uploadImage,
};
