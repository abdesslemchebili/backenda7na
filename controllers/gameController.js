const { LearningGame, GamePlay } = require('../models/LearningGame');
const Book = require('../models/Book');
const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const { pickLocalizedTitle } = require('./bookController');
const { GAME_TYPES } = require('../constants/gamification');
const { awardGamification } = require('../utils/gamificationHelper');
const { syncCourseChapterProgress } = require('../utils/chapterProgressHelper');

function formatGame(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    _id: o._id,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    type: o.type,
    book: o.book,
    chapter: o.chapter,
    course: o.course,
    items: o.items,
    order: o.order,
    xpReward: o.xpReward,
    active: o.active,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function formatPlay(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: o._id,
    game: o.game,
    student: o.student,
    score: o.score,
    xpEarned: o.xpEarned,
    pairsMatched: o.pairsMatched,
    totalPairs: o.totalPairs,
    durationSeconds: o.durationSeconds,
    completedAt: o.completedAt,
    createdAt: o.createdAt,
  };
}

async function canAccessGame(req, game) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (!game.active) return false;

  if (game.course) {
    const course = await Course.findById(game.course).select('professor enrolledStudents');
    if (!course) return false;
    if (course.professor.toString() === req.user._id.toString()) return true;
    return course.enrolledStudents.some((e) => e.student?.toString() === req.user._id.toString());
  }

  const book = await Book.findById(game.book).select('status active');
  if (!book || book.status !== 'published' || !book.active) return false;

  if (req.user.role === 'professor') {
    const owns = await Course.findOne({ bookId: game.book, professor: req.user._id }).select('_id');
    return !!owns;
  }

  if (req.user.role === 'student') {
    const enrolled = await Course.findOne({
      bookId: game.book,
      'enrolledStudents.student': req.user._id,
    }).select('_id');
    return !!enrolled;
  }

  return false;
}

async function canManageGame(req, game) {
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'professor') return false;
  if (game.createdBy?.toString() === req.user._id.toString()) return true;
  const owns = await Course.findOne({ bookId: game.book, professor: req.user._id }).select('_id');
  return !!owns;
}

// GET /api/games
const listGames = async (req, res) => {
  try {
    const filters = {};
    if (req.query.bookId) filters.book = req.query.bookId;
    if (req.query.chapterId) filters.chapter = req.query.chapterId;
    if (req.query.courseId) filters.course = req.query.courseId;
    if (req.query.type) filters.type = req.query.type;
    if (req.user?.role !== 'admin') filters.active = true;

    const games = await LearningGame.find(filters).sort({ order: 1, createdAt: 1 }).lean();

    if (req.user?.role === 'student') {
      const accessible = [];
      for (const g of games) {
        const full = await LearningGame.findById(g._id);
        if (full && (await canAccessGame(req, full))) accessible.push(formatGame(g));
      }
      return res.json({ data: accessible });
    }

    res.json({ data: games.map(formatGame) });
  } catch (err) {
    console.error('listGames:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/games/:id
const getGame = async (req, res) => {
  try {
    const game = await LearningGame.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'NotFound', message: 'Game not found' });
    if (!(await canAccessGame(req, game))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }
    res.json(formatGame(game));
  } catch (err) {
    console.error('getGame:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/games
const createGame = async (req, res) => {
  try {
    const { title, type, bookId, chapterId, courseId, items, order, xpReward } = req.body;

    if (!bookId || !chapterId) {
      return res.status(400).json({ error: 'ValidationError', message: 'bookId and chapterId are required' });
    }
    if (type && !GAME_TYPES.includes(type)) {
      return res.status(400).json({ error: 'ValidationError', message: `type must be one of: ${GAME_TYPES.join(', ')}` });
    }

    const chapter = await Chapter.findById(chapterId).select('book');
    if (!chapter || chapter.book.toString() !== bookId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Chapter does not belong to book' });
    }

    const titleObj =
      typeof title === 'string' ? { fr: title.trim(), en: title.trim(), ar: title.trim() } : title;

    if (!Array.isArray(items) || items.length < 2) {
      return res.status(400).json({ error: 'ValidationError', message: 'At least 2 word pairs are required' });
    }

    const game = await LearningGame.create({
      title: titleObj,
      type: type || 'word_match',
      book: bookId,
      chapter: chapterId,
      course: courseId || null,
      items,
      order: order ?? 0,
      xpReward: xpReward ?? 10,
      createdBy: req.user._id,
    });

    res.status(201).json(formatGame(game));
  } catch (err) {
    console.error('createGame:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/games/:id
const updateGame = async (req, res) => {
  try {
    const game = await LearningGame.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'NotFound', message: 'Game not found' });
    if (!(await canManageGame(req, game))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const { title, type, items, order, xpReward, active } = req.body;
    if (title !== undefined) {
      game.title = typeof title === 'string' ? { fr: title, en: title, ar: title } : title;
    }
    if (type !== undefined) game.type = type;
    if (items !== undefined) game.items = items;
    if (order !== undefined) game.order = order;
    if (xpReward !== undefined) game.xpReward = xpReward;
    if (active !== undefined) game.active = active;

    await game.save();
    res.json(formatGame(game));
  } catch (err) {
    console.error('updateGame:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/games/:id
const deleteGame = async (req, res) => {
  try {
    const game = await LearningGame.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'NotFound', message: 'Game not found' });
    if (!(await canManageGame(req, game))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    game.active = false;
    await game.save();
    res.json({ message: 'Game archived', id: game._id });
  } catch (err) {
    console.error('deleteGame:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/games/:id/play
const playGame = async (req, res) => {
  try {
    const game = await LearningGame.findById(req.params.id);
    if (!game || !game.active) {
      return res.status(404).json({ error: 'NotFound', message: 'Game not found' });
    }
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }
    if (!(await canAccessGame(req, game))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not enrolled' });
    }

    const { score = 0, pairsMatched, totalPairs, durationSeconds } = req.body;
    const clampedScore = Math.max(0, Math.min(100, Number(score) || 0));
    const xpEarned = Math.max(1, Math.round((game.xpReward * clampedScore) / 100));

    const play = await GamePlay.create({
      game: game._id,
      student: req.user._id,
      score: clampedScore,
      xpEarned,
      pairsMatched: pairsMatched ?? 0,
      totalPairs: totalPairs ?? game.items.length,
      durationSeconds: durationSeconds ?? null,
      completedAt: new Date(),
    });

    const gamResult = await awardGamification(req.user._id, {
      xp: xpEarned,
      incrementGames: 1,
    });

    let progressUpdate = null;
    let courseId = game.course;
    if (!courseId && game.book) {
      const linked = await Course.findOne({
        bookId: game.book,
        'enrolledStudents.student': req.user._id,
      }).select('_id');
      courseId = linked?._id;
    }
    if (courseId) {
      progressUpdate = await syncCourseChapterProgress(req.user._id, courseId);
    }

    res.json({
      play: formatPlay(play),
      gamification: gamResult,
      progress: progressUpdate,
    });
  } catch (err) {
    console.error('playGame:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/games/plays/me
const getMyPlays = async (req, res) => {
  try {
    const plays = await GamePlay.find({ student: req.user._id })
      .populate('game', 'title type xpReward')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ data: plays.map(formatPlay) });
  } catch (err) {
    console.error('getMyPlays:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listGames,
  getGame,
  createGame,
  updateGame,
  deleteGame,
  playGame,
  getMyPlays,
};
