const fs = require('fs');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const BookBookmark = require('../models/BookBookmark');
const BookReadingProgress = require('../models/BookReadingProgress');
const BookPageMetadata = require('../models/BookPageMetadata');
const ClassGroup = require('../models/ClassGroup');
const Material = require('../models/Material');
const { formatBook, pickLocalizedTitle } = require('./bookController');
const { formatChapter } = require('./chapterController');
const {
  canAccessBookContent,
  buildBookPdfStreamUrl,
  verifyBookPdfAccessToken,
} = require('../utils/bookAccess');
const { getSignedUrlExpiryIso, normalizeStoredPath, getAbsoluteFilePath } = require('../utils/fileAccess');
const {
  isObjectStorageConfigured,
  isLocalUploadPath,
  getObjectStream,
} = require('../utils/objectStorage');

function parsePageNumber(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function formatBookmark(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: o._id,
    book: o.book,
    pageNumber: o.pageNumber,
    label: o.label || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function formatProgress(doc, bookPageCount = 0) {
  if (!doc) {
    return {
      lastPage: 1,
      highestPage: 1,
      totalPages: bookPageCount || 0,
      percent: 0,
      lastReadAt: null,
    };
  }
  const o = doc.toObject ? doc.toObject() : doc;
  const totalPages = o.totalPages || bookPageCount || 0;
  const highestPage = o.highestPage || o.lastPage || 1;
  return {
    lastPage: o.lastPage || 1,
    highestPage,
    totalPages,
    percent: totalPages > 0 ? Math.min(100, Math.round((highestPage / totalPages) * 100)) : 0,
    lastReadAt: o.lastReadAt || o.updatedAt || null,
  };
}

function formatHotspot(hotspot) {
  if (!hotspot) return null;
  const o = hotspot.toObject ? hotspot.toObject() : hotspot;
  const mat = o.material;
  const materialId = mat?._id ? mat._id.toString() : mat?.toString?.() || null;
  return {
    _id: o._id,
    type: o.type || 'audio',
    x: o.x,
    y: o.y,
    label: o.label || '',
    materialId,
    materialTitle: mat?.title ? pickLocalizedTitle(mat.title) : o.label || 'Audio',
  };
}

function formatPageMetadata(doc, { includeTeacherNotes = false, classGroupId = null } = {}) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  let teacherNotes = [];
  if (includeTeacherNotes && Array.isArray(o.teacherNotes)) {
    teacherNotes = o.teacherNotes
      .filter((n) => {
        if (!classGroupId) return false;
        return n.classGroup?.toString() === classGroupId.toString();
      })
      .map((n) => ({
        _id: n._id,
        classGroup: n.classGroup,
        author: n.author,
        note: n.note,
        createdAt: n.createdAt,
      }));
  }
  return {
    _id: o._id,
    book: o.book,
    pageNumber: o.pageNumber,
    chapter: o.chapter,
    vocabulary: o.vocabulary || [],
    audioReferences: o.audioReferences || [],
    exerciseReferences: o.exerciseReferences || [],
    gameReferences: o.gameReferences || [],
    videoReferences: o.videoReferences || [],
    hotspots: Array.isArray(o.hotspots) ? o.hotspots.map(formatHotspot).filter(Boolean) : [],
    teacherNotes,
  };
}

async function loadBookOr404(req, res) {
  const book = await Book.findById(req.params.id).lean();
  if (!book) {
    res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    return null;
  }
  return book;
}

async function requireBookContentAccess(req, res, book) {
  const allowed = await canAccessBookContent(req, book);
  if (!allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Not allowed to access this book',
    });
    return false;
  }
  return true;
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start = match[1] === '' ? null : parseInt(match[1], 10);
  let end = match[2] === '' ? null : parseInt(match[2], 10);
  if (start == null && end == null) return null;
  if (start == null) {
    start = Math.max(0, fileSize - end);
    end = fileSize - 1;
  } else if (end == null) {
    end = fileSize - 1;
  }
  if (start < 0 || end >= fileSize || start > end) return null;
  return { start, end };
}

function pipeBody(body, res) {
  if (body && typeof body.pipe === 'function') {
    body.pipe(res);
    return;
  }
  const chunks = [];
  (async () => {
    for await (const chunk of body) chunks.push(chunk);
    res.end(Buffer.concat(chunks));
  })().catch((err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    } else {
      res.destroy(err);
    }
  });
}

async function resolveStreamUser(req) {
  if (req.user) return req.user;
  const token = req.query.token;
  if (!token) return null;
  try {
    const decoded = verifyBookPdfAccessToken(token);
    if (decoded.bookId !== req.params.id) return null;
    const User = require('../models/User');
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || user.status === 'suspended' || user.isLocked) return null;
    req.user = user;
    return user;
  } catch {
    return null;
  }
}

// GET /api/books/:id/reader
const getBookReader = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('language', 'name code icon')
      .populate('level', 'code name')
      .lean();
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }
    if (!(await requireBookContentAccess(req, res, book))) return;
    if (!book.pdfUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'PDF not available' });
    }

    const classGroupId = req.query.classGroupId || null;
    if (classGroupId && req.user.role === 'student') {
      const member = await ClassGroup.findOne({
        _id: classGroupId,
        bookId: book._id,
        studentIds: req.user._id,
      }).select('_id');
      if (!member) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Not enrolled in this class group',
        });
      }
    }

    const chapterFilters = { book: book._id };
    if (req.user.role !== 'admin') chapterFilters.status = 'published';

    const [chapters, progress, bookmarks, pageMetadata, audios] = await Promise.all([
      Chapter.find(chapterFilters).sort({ order: 1 }).lean(),
      BookReadingProgress.findOne({ user: req.user._id, book: book._id }).lean(),
      BookBookmark.find({ user: req.user._id, book: book._id }).sort({ pageNumber: 1 }).lean(),
      BookPageMetadata.find({ book: book._id })
        .populate('hotspots.material', 'title type active')
        .sort({ pageNumber: 1 })
        .lean(),
      Material.find({ book: book._id, type: 'audio', active: true })
        .select('title type chapter order duration')
        .sort({ order: 1, createdAt: 1 })
        .lean(),
    ]);

    const formattedBook = formatBook(book);
    formattedBook.hasPdf = Boolean(book.pdfUrl);
    if (req.user.role !== 'admin') {
      formattedBook.pdfUrl = null;
    }

    const streamUrl = buildBookPdfStreamUrl(book._id, req.user._id, req);
    const filename = `${pickLocalizedTitle(book.title).replace(/[^\w\s-]/g, '') || 'book'}.pdf`;

    res.json({
      book: formattedBook,
      chapters: chapters.map(formatChapter),
      pdf: {
        streamUrl,
        expiresAt: getSignedUrlExpiryIso('2h'),
        filename,
        mimeType: book.pdfMimeType || 'application/pdf',
        size: book.pdfSize || 0,
        pageCount: book.pageCount || 0,
      },
      progress: formatProgress(progress, book.pageCount),
      bookmarks: bookmarks.map(formatBookmark),
      pageMetadata: pageMetadata.map((row) =>
        formatPageMetadata(row, {
          includeTeacherNotes: true,
          classGroupId,
        })
      ),
      audios: audios.map((m) => ({
        _id: m._id,
        displayTitle: pickLocalizedTitle(m.title),
        chapter: m.chapter,
        order: m.order || 0,
        duration: m.duration,
      })),
      access: {
        canRead: true,
        canManage:
          req.user.role === 'admin' &&
          ['super', 'full', 'content'].includes(req.user.adminLevel),
        classGroupId,
      },
    });
  } catch (err) {
    console.error('getBookReader:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/books/:id/stream
const streamBookPdf = async (req, res) => {
  try {
    const user = await resolveStreamUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
    if (user.role === 'student' && user.status !== 'reglo') {
      return res.status(403).json({
        error: 'Paiement requis',
        message: 'Votre paiement doit être confirmé pour accéder à cette ressource.',
      });
    }

    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    if (!book.pdfUrl) {
      return res.status(404).json({ error: 'NotFound', message: 'PDF not available' });
    }

    const mime = book.pdfMimeType || 'application/pdf';
    const filename = `${pickLocalizedTitle(book.title).replace(/[^\w\s-]/g, '') || 'book'}.pdf`;
    const commonHeaders = {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    };

    if (!isLocalUploadPath(book.pdfUrl) && isObjectStorageConfigured()) {
      try {
        const rangeHeader = req.headers.range;
        const obj = await getObjectStream(book.pdfUrl, rangeHeader ? { range: rangeHeader } : {});
        Object.entries(commonHeaders).forEach(([k, v]) => res.setHeader(k, v));
        if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength));
        if (obj.contentRange) res.setHeader('Content-Range', obj.contentRange);
        res.status(obj.statusCode || (rangeHeader ? 206 : 200));
        pipeBody(obj.body, res);
        return;
      } catch (storageErr) {
        console.error('streamBookPdf storage:', storageErr.message || storageErr);
        return res.status(404).json({
          error: 'NotFound',
          message: 'PDF file missing in storage. Re-upload the book PDF from Admin → Books.',
        });
      }
    }

    const normalized = normalizeStoredPath(book.pdfUrl);
    const abs = getAbsoluteFilePath(normalized);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'PDF file missing on server disk. Re-upload the book PDF from Admin → Books.',
      });
    }

    const stat = fs.statSync(abs);
    const range = parseRangeHeader(req.headers.range, stat.size);
    Object.entries(commonHeaders).forEach(([k, v]) => res.setHeader(k, v));

    if (range) {
      const chunkSize = range.end - range.start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader('Content-Length', String(chunkSize));
      fs.createReadStream(abs, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    console.error('streamBookPdf:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
};

// GET /api/books/:id/bookmarks
const listBookmarks = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const rows = await BookBookmark.find({ user: req.user._id, book: book._id })
      .sort({ pageNumber: 1 })
      .lean();
    res.json({ data: rows.map(formatBookmark) });
  } catch (err) {
    console.error('listBookmarks:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/books/:id/bookmarks
const createBookmark = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const pageNumber = parsePageNumber(req.body.pageNumber ?? req.body.page);
    if (!pageNumber) {
      return res.status(400).json({ error: 'ValidationError', message: 'pageNumber is required' });
    }
    const label = req.body.label ? String(req.body.label).trim().slice(0, 200) : '';
    const doc = await BookBookmark.findOneAndUpdate(
      { user: req.user._id, book: book._id, pageNumber },
      { $set: { label } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(formatBookmark(doc));
  } catch (err) {
    if (err.code === 11000) {
      const existing = await BookBookmark.findOne({
        user: req.user._id,
        book: req.params.id,
        pageNumber: parsePageNumber(req.body.pageNumber ?? req.body.page),
      });
      return res.status(200).json(formatBookmark(existing));
    }
    console.error('createBookmark:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/books/:id/bookmarks/:page
const deleteBookmark = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const pageNumber = parsePageNumber(req.params.page);
    if (!pageNumber) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid page' });
    }
    const result = await BookBookmark.findOneAndDelete({
      user: req.user._id,
      book: book._id,
      pageNumber,
    });
    if (!result) {
      return res.status(404).json({ error: 'NotFound', message: 'Bookmark not found' });
    }
    res.json({ message: 'Bookmark removed', pageNumber });
  } catch (err) {
    console.error('deleteBookmark:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/books/:id/progress
const getReadingProgress = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const doc = await BookReadingProgress.findOne({ user: req.user._id, book: book._id }).lean();
    res.json(formatProgress(doc, book.pageCount));
  } catch (err) {
    console.error('getReadingProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/books/:id/progress
const upsertReadingProgress = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const lastPage = parsePageNumber(req.body.lastPage ?? req.body.page);
    if (!lastPage) {
      return res.status(400).json({ error: 'ValidationError', message: 'lastPage is required' });
    }
    const totalPages = parsePageNumber(req.body.totalPages) || 0;
    const existing = await BookReadingProgress.findOne({ user: req.user._id, book: book._id });
    const highestPage = Math.max(existing?.highestPage || 1, lastPage);

    const doc = await BookReadingProgress.findOneAndUpdate(
      { user: req.user._id, book: book._id },
      {
        $set: {
          lastPage,
          highestPage,
          lastReadAt: new Date(),
          ...(totalPages > 0 ? { totalPages } : {}),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (totalPages > 0 && (!book.pageCount || book.pageCount !== totalPages)) {
      await Book.updateOne({ _id: book._id }, { $set: { pageCount: totalPages } });
    }

    res.json(formatProgress(doc, totalPages || book.pageCount));
  } catch (err) {
    console.error('upsertReadingProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/books/:id/page-metadata
const listPageMetadata = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    if (!(await requireBookContentAccess(req, res, book))) return;
    const pageNumber = parsePageNumber(req.query.page);
    const filter = { book: book._id };
    if (pageNumber) filter.pageNumber = pageNumber;
    const rows = await BookPageMetadata.find(filter)
      .populate('hotspots.material', 'title type active')
      .sort({ pageNumber: 1 })
      .lean();
    const classGroupId = req.query.classGroupId || null;
    res.json({
      data: rows.map((row) =>
        formatPageMetadata(row, { includeTeacherNotes: true, classGroupId })
      ),
    });
  } catch (err) {
    console.error('listPageMetadata:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

function parseObjectIdList(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((id) => String(id).trim()).filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
}

function parseVocabulary(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const term = item.trim();
        return term ? { term, translation: '', audioUrl: '' } : null;
      }
      const term = String(item?.term || '').trim();
      if (!term) return null;
      return {
        term: term.slice(0, 200),
        translation: String(item.translation || '').trim().slice(0, 400),
        audioUrl: String(item.audioUrl || '').trim(),
      };
    })
    .filter(Boolean);
}

// PUT /api/books/:id/page-metadata/:pageNumber  (content admin)
const upsertPageMetadata = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    const pageNumber = parsePageNumber(req.params.pageNumber);
    if (!pageNumber) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid pageNumber' });
    }

    const chapter = req.body.chapterId || req.body.chapter || null;
    if (chapter) {
      const chapterDoc = await Chapter.findOne({ _id: chapter, book: book._id }).select('_id');
      if (!chapterDoc) {
        return res.status(400).json({ error: 'ValidationError', message: 'Chapter does not belong to this book' });
      }
    }

    const update = {
      chapter: chapter || null,
      vocabulary: parseVocabulary(req.body.vocabulary),
      audioReferences: parseObjectIdList(req.body.audioReferences),
      exerciseReferences: parseObjectIdList(req.body.exerciseReferences),
      gameReferences: parseObjectIdList(req.body.gameReferences),
      videoReferences: Array.isArray(req.body.videoReferences)
        ? req.body.videoReferences
            .filter((v) => v && (v.url || v.title))
            .map((v) => ({
              title: String(v.title || '').trim().slice(0, 200),
              url: String(v.url || '').trim().slice(0, 2000),
            }))
        : [],
    };

    const doc = await BookPageMetadata.findOneAndUpdate(
      { book: book._id, pageNumber },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(formatPageMetadata(doc, { includeTeacherNotes: true, classGroupId: req.body.classGroupId }));
  } catch (err) {
    console.error('upsertPageMetadata:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/books/:id/page-metadata/:pageNumber
const deletePageMetadata = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    const pageNumber = parsePageNumber(req.params.pageNumber);
    if (!pageNumber) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid pageNumber' });
    }
    const result = await BookPageMetadata.findOneAndDelete({ book: book._id, pageNumber });
    if (!result) {
      return res.status(404).json({ error: 'NotFound', message: 'Page metadata not found' });
    }
    res.json({ message: 'Page metadata removed', pageNumber });
  } catch (err) {
    console.error('deletePageMetadata:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

async function respondFormattedMetadata(res, doc, status = 200) {
  const populated = await BookPageMetadata.findById(doc._id)
    .populate('hotspots.material', 'title type active')
    .lean();
  res.status(status).json(formatPageMetadata(populated, { includeTeacherNotes: true }));
}

// POST /api/books/:id/page-metadata/:pageNumber/hotspots
const addPageHotspot = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    const pageNumber = parsePageNumber(req.params.pageNumber);
    if (!pageNumber) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid pageNumber' });
    }
    const x = clampPercent(req.body.x);
    const y = clampPercent(req.body.y);
    const materialId = req.body.materialId || req.body.material;
    if (x == null || y == null || !materialId) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'x, y and materialId are required',
      });
    }
    const material = await Material.findById(materialId).select('type book chapter active title');
    if (!material || material.type !== 'audio' || material.active === false) {
      return res.status(400).json({ error: 'ValidationError', message: 'Audio material not found' });
    }
    if (material.book && material.book.toString() !== book._id.toString()) {
      return res.status(400).json({ error: 'ValidationError', message: 'Audio does not belong to this book' });
    }

    const hotspot = {
      type: 'audio',
      x,
      y,
      material: material._id,
      label: req.body.label ? String(req.body.label).trim().slice(0, 200) : pickLocalizedTitle(material.title),
    };

    const doc = await BookPageMetadata.findOneAndUpdate(
      { book: book._id, pageNumber },
      {
        $push: { hotspots: hotspot },
        $addToSet: { audioReferences: material._id },
        $setOnInsert: {
          book: book._id,
          pageNumber,
          chapter: material.chapter || null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await respondFormattedMetadata(res, doc, 201);
  } catch (err) {
    console.error('addPageHotspot:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/books/:id/page-metadata/:pageNumber/hotspots/:hotspotId
const updatePageHotspot = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    const pageNumber = parsePageNumber(req.params.pageNumber);
    const { hotspotId } = req.params;
    if (!pageNumber || !hotspotId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid ids' });
    }
    const doc = await BookPageMetadata.findOne({ book: book._id, pageNumber });
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Page metadata not found' });
    }
    const hotspot = doc.hotspots.id(hotspotId);
    if (!hotspot) {
      return res.status(404).json({ error: 'NotFound', message: 'Hotspot not found' });
    }
    if (req.body.x != null) {
      const x = clampPercent(req.body.x);
      if (x != null) hotspot.x = x;
    }
    if (req.body.y != null) {
      const y = clampPercent(req.body.y);
      if (y != null) hotspot.y = y;
    }
    if (req.body.label !== undefined) hotspot.label = String(req.body.label || '').trim().slice(0, 200);
    if (req.body.materialId) hotspot.material = req.body.materialId;
    await doc.save();
    await respondFormattedMetadata(res, doc);
  } catch (err) {
    console.error('updatePageHotspot:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/books/:id/page-metadata/:pageNumber/hotspots/:hotspotId
const deletePageHotspot = async (req, res) => {
  try {
    const book = await loadBookOr404(req, res);
    if (!book) return;
    const pageNumber = parsePageNumber(req.params.pageNumber);
    const { hotspotId } = req.params;
    if (!pageNumber || !hotspotId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid ids' });
    }
    const doc = await BookPageMetadata.findOne({ book: book._id, pageNumber });
    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Page metadata not found' });
    }
    const hotspot = doc.hotspots.id(hotspotId);
    if (!hotspot) {
      return res.status(404).json({ error: 'NotFound', message: 'Hotspot not found' });
    }
    hotspot.deleteOne();
    await doc.save();
    await respondFormattedMetadata(res, doc);
  } catch (err) {
    console.error('deletePageHotspot:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  getBookReader,
  streamBookPdf,
  listBookmarks,
  createBookmark,
  deleteBookmark,
  getReadingProgress,
  upsertReadingProgress,
  listPageMetadata,
  upsertPageMetadata,
  deletePageMetadata,
  addPageHotspot,
  updatePageHotspot,
  deletePageHotspot,
};
