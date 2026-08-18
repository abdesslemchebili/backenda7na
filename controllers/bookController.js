const path = require('path');
const fs = require('fs');
const Book = require('../models/Book');
const { buildSignedFileUrl, getSignedUrlExpiryIso } = require('../utils/fileAccess');
const {
  canReadBookCatalog,
  canAccessBookContent,
  isEnrolledInBookGroup,
  isProfessorOfBookGroup,
} = require('../utils/bookAccess');
const {
  isObjectStorageConfigured,
  isLocalUploadPath,
  buildObjectPresignedUrl,
  uploadLocalFileToObjectStorage,
  deleteObjectFromStorage,
} = require('../utils/objectStorage');

function pickLocalizedTitle(title, fallback = 'Sans titre') {
  if (!title) return fallback;
  if (typeof title === 'string') return title;
  return title.fr || title.en || title.ar || fallback;
}

function formatBook(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const lang = o.language;
  const lvl = o.level;
  return {
    _id: o._id,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    author: o.author,
    publisher: o.publisher,
    language: lang?._id ? lang._id.toString() : lang?.toString?.() || lang,
    languageDoc: lang?._id
      ? { _id: lang._id, name: lang.name, code: lang.code, icon: lang.icon }
      : undefined,
    level: lvl?._id ? lvl._id.toString() : lvl?.toString?.() || lvl || null,
    levelDoc: lvl?._id
      ? { _id: lvl._id, code: lvl.code, name: lvl.name }
      : undefined,
    isbn: o.isbn || '',
    coverUrl: o.coverUrl,
    pdfUrl: o.pdfUrl,
    hasPdf: Boolean(o.pdfUrl),
    pdfSize: o.pdfSize,
    pdfMimeType: o.pdfMimeType || 'application/pdf',
    pageCount: o.pageCount || 0,
    publicResource: Boolean(o.publicResource),
    description: o.description,
    status: o.status,
    active: o.active,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

const canReadBook = canReadBookCatalog;

/** @deprecated aliases */
const isEnrolledInBookCourse = isEnrolledInBookGroup;
const isProfessorOfBookCourse = isProfessorOfBookGroup;

// GET /api/books
const listBooks = async (req, res) => {
  try {
    const filters = {};
    if (req.query.languageId) filters.language = req.query.languageId;
    if (req.query.levelId) filters.level = req.query.levelId;
    if (req.query.status) filters.status = req.query.status;
    if (req.user?.role !== 'admin') {
      filters.status = 'published';
      filters.active = true;
    } else if (req.query.active === 'true') {
      filters.active = true;
    } else if (req.query.active === 'false') {
      filters.active = false;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      Book.find(filters)
        .populate('language', 'name code icon')
        .populate('level', 'code name')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Book.countDocuments(filters),
    ]);

    res.json({
      data: rows.map(formatBook),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error('listBooks:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/books/:id
const getBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('language', 'name code icon')
      .populate('level', 'code name')
      .lean();
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }
    if (!(await canReadBook(req, book))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed to view this book' });
    }
    res.json(formatBook(book));
  } catch (err) {
    console.error('getBook:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/books
const createBook = async (req, res) => {
  try {
    const { title, author, publisher, isbn, languageId, levelId, description, status, active, publicResource } = req.body;
    if (!languageId) {
      return res.status(400).json({ error: 'ValidationError', message: 'languageId is required' });
    }

    const titleObj =
      typeof title === 'string'
        ? { fr: title.trim(), en: title.trim(), ar: '' }
        : title;

    if (!titleObj?.fr && !titleObj?.en) {
      return res.status(400).json({ error: 'ValidationError', message: 'title is required' });
    }

    const book = await Book.create({
      title: titleObj,
      author: author ? String(author).trim() : undefined,
      publisher: publisher ? String(publisher).trim() : undefined,
      isbn: isbn ? String(isbn).trim() : '',
      language: languageId,
      level: levelId || null,
      description: description || undefined,
      status: ['draft', 'published', 'archived'].includes(status) ? status : 'draft',
      active: active !== false,
      publicResource: Boolean(publicResource),
      createdBy: req.user._id,
    });

    const populated = await Book.findById(book._id)
      .populate('language', 'name code icon')
      .populate('level', 'code name')
      .lean();

    res.status(201).json(formatBook(populated));
  } catch (err) {
    console.error('createBook:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/books/:id
const updateBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }

    const { title, author, publisher, isbn, languageId, levelId, description, status, active, publicResource } = req.body;
    if (title !== undefined) {
      book.title = typeof title === 'string' ? { fr: title, en: title, ar: book.title?.ar || '' } : title;
    }
    if (author !== undefined) book.author = author ? String(author).trim() : '';
    if (publisher !== undefined) book.publisher = publisher ? String(publisher).trim() : '';
    if (isbn !== undefined) book.isbn = isbn ? String(isbn).trim() : '';
    if (languageId !== undefined) book.language = languageId;
    if (levelId !== undefined) book.level = levelId || null;
    if (description !== undefined) book.description = description;
    if (status !== undefined && ['draft', 'published', 'archived'].includes(status)) {
      book.status = status;
    }
    if (active !== undefined) book.active = Boolean(active);
    if (publicResource !== undefined) book.publicResource = Boolean(publicResource);

    await book.save();
    const populated = await Book.findById(book._id)
      .populate('language', 'name code icon')
      .populate('level', 'code name')
      .lean();
    res.json(formatBook(populated));
  } catch (err) {
    console.error('updateBook:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/books/:id — soft archive
const deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }
    book.status = 'archived';
    book.active = false;
    await book.save();
    res.json({ message: 'Book archived', id: book._id });
  } catch (err) {
    console.error('deleteBook:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/books/:id/pdf
const uploadBookPdf = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'PDF file is required' });
    }

    const previousPdfUrl = book.pdfUrl;

    if (isObjectStorageConfigured()) {
      const safeName = (req.file.originalname || 'book.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `books/${book._id}/${Date.now()}-${safeName}`;
      await uploadLocalFileToObjectStorage({
        localPath: req.file.path,
        key,
        contentType: req.file.mimetype || 'application/pdf',
      });
      // Local multer temp copy no longer needed once in R2
      if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
      book.pdfUrl = key;
    } else {
      book.pdfUrl = `/uploads/documents/${req.file.filename}`;
    }

    book.pdfSize = req.file.size || 0;
    book.pdfMimeType = req.file.mimetype || 'application/pdf';
    await book.save();

    if (previousPdfUrl && previousPdfUrl !== book.pdfUrl) {
      if (isLocalUploadPath(previousPdfUrl)) {
        const oldPath = path.join(__dirname, '..', previousPdfUrl.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
      } else {
        await deleteObjectFromStorage(previousPdfUrl);
      }
    }

    res.json(formatBook(await Book.findById(book._id).populate('language', 'name code icon').populate('level', 'code name').lean()));
  } catch (err) {
    console.error('uploadBookPdf:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/books/:id/cover
const uploadBookCover = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'BadRequest', message: 'Cover image is required' });
    }

    book.coverUrl = `/uploads/images/${req.file.filename}`;
    await book.save();

    res.json(formatBook(await Book.findById(book._id).populate('language', 'name code icon').populate('level', 'code name').lean()));
  } catch (err) {
    console.error('uploadBookCover:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/books/:id/download
const downloadBookPdf = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book || !book.pdfUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'PDF not available' });
    }

    const allowed = await canAccessBookContent(req, book);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed to download this book' });
    }

    const filename = `${pickLocalizedTitle(book.title).replace(/[^\w\s-]/g, '') || 'book'}.pdf`;

    // Object storage (R2/S3) — durable; preferred in production
    if (!isLocalUploadPath(book.pdfUrl) && isObjectStorageConfigured()) {
      try {
        const signed = await buildObjectPresignedUrl(book.pdfUrl);
        return res.json({
          url: signed.url,
          expiresAt: signed.expiresAt || getSignedUrlExpiryIso(),
          filename,
        });
      } catch (storageErr) {
        console.error('downloadBookPdf storage:', storageErr.message || storageErr);
        return res.status(404).json({
          error: 'NotFound',
          message: 'PDF file missing in storage. Re-upload the book PDF from Admin → Books.',
        });
      }
    }

    // Legacy local /uploads path (ephemeral on Render)
    const absCheck = path.join(__dirname, '..', book.pdfUrl.replace(/^\//, ''));
    if (!fs.existsSync(absCheck)) {
      return res.status(404).json({
        error: 'NotFound',
        message:
          'PDF file missing on server disk. Re-upload the book PDF from Admin → Books (configure S3/R2 for durable storage).',
      });
    }

    const url = buildSignedFileUrl(book.pdfUrl, req.user?._id, req);
    res.json({
      url,
      expiresAt: getSignedUrlExpiryIso(),
      filename,
    });
  } catch (err) {
    console.error('downloadBookPdf:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  uploadBookPdf,
  uploadBookCover,
  downloadBookPdf,
  formatBook,
  pickLocalizedTitle,
};
