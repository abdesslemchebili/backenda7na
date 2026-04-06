const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const Course = require('../models/Course');

// POST /api/courses/:courseId/documents - upload document
const uploadDocument = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    }
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to upload to this course' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'File is required' });
    }
    const titleEn = req.body.title || req.file.originalname || 'Document';
    const typeMap = { '.pdf': 'pdf', '.doc': 'doc', '.docx': 'doc', '.ppt': 'ppt', '.pptx': 'ppt' };
    const ext = path.extname(req.file.originalname).toLowerCase();
    const docType = req.body.type || typeMap[ext] || 'other';
    const relativePath = `/uploads/documents/${req.file.filename}`;
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const doc = new Document({
      title: { en: titleEn, fr: '', ar: '' },
      url: baseUrl + relativePath,
      type: docType,
      size: req.file.size || 0,
      course: courseId,
      uploadedBy: req.user._id
    });
    await doc.save();
    res.status(201).json({
      _id: doc._id,
      title: doc.title,
      url: doc.url,
      type: doc.type,
      size: doc.size,
      course: courseId,
      uploadedBy: req.user._id,
      createdAt: doc.createdAt
    });
  } catch (err) {
    console.error('uploadDocument:', err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/courses/:courseId/documents - list by course
const listByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    }
    const isProfessor = req.user.role === 'professor' && course.professor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isEnrolled = course.enrolledStudents.some(e => e.student && e.student.toString() === req.user._id.toString());
    if (!isProfessor && !isAdmin && !isEnrolled) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to view these documents' });
    }
    const { page = 1, limit = 20, type, search } = req.query;
    const filter = { course: courseId };
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { 'title.en': { $regex: search, $options: 'i' } },
        { 'title.fr': { $regex: search, $options: 'i' } },
        { 'title.ar': { $regex: search, $options: 'i' } }
      ];
    }
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const [data, total] = await Promise.all([
      Document.find(filter).populate('uploadedBy', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Document.countDocuments(filter)
    ]);
    res.json({
      data,
      pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('listByCourse:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/documents/:id/download
const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('course');
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Document not found' });
    }
    const course = doc.course;
    const isProfessor = req.user.role === 'professor' && course.professor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isEnrolled = course.enrolledStudents.some(e => e.student && e.student.toString() === req.user._id.toString());
    if (!isProfessor && !isAdmin && !isEnrolled) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const url = doc.url;
    const filename = (doc.title && doc.title.en) ? `${doc.title.en}.${doc.type || 'pdf'}` : (doc.url.split('/').pop() || 'document');
    res.json({ url, expiresAt: new Date(Date.now() + 3600000).toISOString(), filename });
  } catch (err) {
    console.error('downloadDocument:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/documents/:id
const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('course');
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Document not found' });
    }
    const course = doc.course;
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to delete this document' });
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
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const url = `${baseUrl}/uploads/images/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    console.error('uploadImage:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  uploadDocument,
  listByCourse,
  downloadDocument,
  deleteDocument,
  uploadImage
};
