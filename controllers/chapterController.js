const Chapter = require('../models/Chapter');
const Book = require('../models/Book');
const Material = require('../models/Material');
const { pickLocalizedTitle } = require('./bookController');

function formatSection(section) {
  if (!section) return null;
  const o = section.toObject ? section.toObject() : section;
  return {
    _id: o._id,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    order: o.order,
    pageStart: o.pageStart,
    pageEnd: o.pageEnd,
  };
}

function parseSections(value) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item, index) => {
      const titleObj =
        typeof item.title === 'string'
          ? { fr: item.title.trim(), en: item.title.trim(), ar: '' }
          : item.title;
      if (!titleObj?.fr && !titleObj?.en) return null;
      const parsed = {
        title: titleObj,
        order: Number(item.order) > 0 ? Number(item.order) : index + 1,
        pageStart: item.pageStart != null && item.pageStart !== '' ? Number(item.pageStart) : null,
        pageEnd: item.pageEnd != null && item.pageEnd !== '' ? Number(item.pageEnd) : null,
      };
      if (item._id) parsed._id = item._id;
      return parsed;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function formatChapter(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const book = o.book;
  return {
    _id: o._id,
    book: book?._id ? book._id.toString() : book?.toString?.() || book,
    bookDoc: book?._id
      ? { _id: book._id, title: book.title, displayTitle: pickLocalizedTitle(book.title) }
      : undefined,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    order: o.order,
    description: o.description,
    pageStart: o.pageStart,
    pageEnd: o.pageEnd,
    sections: Array.isArray(o.sections) ? o.sections.map(formatSection).filter(Boolean) : [],
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function canManageBookChapters(req, bookId) {
  if (req.user.role === 'admin') return true;
  const book = await Book.findById(bookId).select('createdBy status');
  if (!book) return false;
  return book.createdBy?.toString() === req.user._id.toString();
}

// GET /api/books/:bookId/chapters
const listByBook = async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId).lean();
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }

    const filters = { book: bookId };
    if (req.user?.role !== 'admin') {
      filters.status = 'published';
    } else if (req.query.status) {
      filters.status = req.query.status;
    }

    const chapters = await Chapter.find(filters)
      .populate('book', 'title language')
      .sort({ order: 1 })
      .lean();

    res.json({ data: chapters.map(formatChapter) });
  } catch (err) {
    console.error('listByBook chapters:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/books/:bookId/chapters
const createChapter = async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'NotFound', message: 'Book not found' });
    }

    const { title, order, description, pageStart, pageEnd, status, sections } = req.body;
    if (!order) {
      return res.status(400).json({ error: 'ValidationError', message: 'order is required' });
    }

    const titleObj =
      typeof title === 'string'
        ? { fr: title.trim(), en: title.trim(), ar: '' }
        : title;
    if (!titleObj?.fr && !titleObj?.en) {
      return res.status(400).json({ error: 'ValidationError', message: 'title is required' });
    }

    const existing = await Chapter.findOne({ book: bookId, order: Number(order) });
    if (existing) {
      return res.status(400).json({ error: 'ValidationError', message: 'Chapter order already exists for this book' });
    }

    const chapter = await Chapter.create({
      book: bookId,
      title: titleObj,
      order: Number(order),
      description: description || undefined,
      pageStart: pageStart != null ? Number(pageStart) : null,
      pageEnd: pageEnd != null ? Number(pageEnd) : null,
      sections: parseSections(sections) || [],
      status: ['draft', 'published', 'archived'].includes(status) ? status : 'draft',
    });

    const populated = await Chapter.findById(chapter._id).populate('book', 'title').lean();
    res.status(201).json(formatChapter(populated));
  } catch (err) {
    console.error('createChapter:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/chapters/:id
const getChapter = async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id).populate('book', 'title status active').lean();
    if (!chapter) {
      return res.status(404).json({ error: 'NotFound', message: 'Chapter not found' });
    }
    if (req.user?.role !== 'admin' && chapter.status !== 'published') {
      return res.status(404).json({ error: 'NotFound', message: 'Chapter not found' });
    }
    res.json(formatChapter(chapter));
  } catch (err) {
    console.error('getChapter:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/chapters/:id
const updateChapter = async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: 'NotFound', message: 'Chapter not found' });
    }

    const { title, order, description, pageStart, pageEnd, status, sections } = req.body;
    if (title !== undefined) {
      chapter.title = typeof title === 'string' ? { fr: title, en: title, ar: chapter.title?.ar || '' } : title;
    }
    if (order !== undefined) {
      const dup = await Chapter.findOne({
        book: chapter.book,
        order: Number(order),
        _id: { $ne: chapter._id },
      });
      if (dup) {
        return res.status(400).json({ error: 'ValidationError', message: 'Chapter order already exists' });
      }
      chapter.order = Number(order);
    }
    if (description !== undefined) chapter.description = description;
    if (pageStart !== undefined) chapter.pageStart = pageStart != null ? Number(pageStart) : null;
    if (pageEnd !== undefined) chapter.pageEnd = pageEnd != null ? Number(pageEnd) : null;
    if (status !== undefined && ['draft', 'published', 'archived'].includes(status)) {
      chapter.status = status;
    }
    const parsedSections = parseSections(sections);
    if (parsedSections) chapter.sections = parsedSections;

    await chapter.save();
    const populated = await Chapter.findById(chapter._id).populate('book', 'title').lean();
    res.json(formatChapter(populated));
  } catch (err) {
    console.error('updateChapter:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/chapters/:id
const deleteChapter = async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: 'NotFound', message: 'Chapter not found' });
    }
    chapter.status = 'archived';
    await chapter.save();
    await Material.updateMany({ chapter: chapter._id }, { active: false });
    res.json({ message: 'Chapter archived', id: chapter._id });
  } catch (err) {
    console.error('deleteChapter:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listByBook,
  createChapter,
  getChapter,
  updateChapter,
  deleteChapter,
  formatChapter,
};
