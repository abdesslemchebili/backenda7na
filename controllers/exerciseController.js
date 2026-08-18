const { Exercise, ExerciseSubmission } = require('../models/Exercise');
const Book = require('../models/Book');
const ClassGroup = require('../models/ClassGroup');
const Chapter = require('../models/Chapter');
const { pickLocalizedTitle } = require('./bookController');
const { scoreExercise } = require('../utils/exerciseScoring');
const { notifyUser } = require('../utils/notifyUser');
const { awardGamification, XP_REWARDS } = require('../utils/gamificationHelper');
const { syncGroupChapterProgress } = require('../utils/chapterProgressHelper');

function formatExercise(doc, includeAnswers = false) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const questions = (o.questions || []).map((q) => {
    const item = {
      _id: q._id,
      type: q.type,
      question: q.question,
      options: q.options,
      audioUrl: q.audioUrl,
      points: q.points,
    };
    if (includeAnswers) item.correctAnswer = q.correctAnswer;
    return item;
  });
  return {
    _id: o._id,
    title: o.title,
    displayTitle: pickLocalizedTitle(o.title),
    book: o.book,
    chapter: o.chapter,
    classGroup: o.classGroup,
    classGroupId: o.classGroup,
    order: o.order,
    questions,
    passingScore: o.passingScore,
    maxAttempts: o.maxAttempts,
    active: o.active,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function formatSubmission(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    _id: o._id,
    exercise: o.exercise,
    student: o.student,
    answers: o.answers,
    score: o.score,
    maxScore: o.maxScore,
    percentage: o.percentage,
    passed: o.passed,
    status: o.status,
    needsManualReview: o.needsManualReview,
    feedback: o.feedback,
    gradedBy: o.gradedBy,
    gradedAt: o.gradedAt,
    attemptNumber: o.attemptNumber,
    completedAt: o.completedAt,
    createdAt: o.createdAt,
  };
}

async function canAccessExercise(req, exercise) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (!exercise.active) return false;

  if (exercise.classGroup) {
    const group = await ClassGroup.findById(exercise.classGroup).select(
      'professorId studentIds'
    );
    if (!group) return false;
    if (group.professorId?.toString() === req.user._id.toString()) return true;
    return (group.studentIds || []).some(
      (id) => id?.toString() === req.user._id.toString()
    );
  }

  const book = await Book.findById(exercise.book).select('status active');
  if (!book || book.status !== 'published' || !book.active) return false;

  if (req.user.role === 'professor') {
    const owns = await ClassGroup.findOne({
      bookId: exercise.book,
      professorId: req.user._id,
    }).select('_id');
    return !!owns;
  }

  if (req.user.role === 'student') {
    const enrolled = await ClassGroup.findOne({
      bookId: exercise.book,
      studentIds: req.user._id,
    }).select('_id');
    return !!enrolled;
  }

  return false;
}

async function canManageExercise(req, exercise) {
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'professor') return false;
  if (exercise.createdBy?.toString() === req.user._id.toString()) return true;
  const owns = await ClassGroup.findOne({
    bookId: exercise.book,
    professorId: req.user._id,
  }).select('_id');
  return !!owns;
}

// GET /api/exercises
const listExercises = async (req, res) => {
  try {
    const filters = {};
    if (req.query.bookId) filters.book = req.query.bookId;
    if (req.query.chapterId) filters.chapter = req.query.chapterId;
    if (req.query.classGroupId || req.query.courseId) {
      filters.classGroup = req.query.classGroupId || req.query.courseId;
    }
    if (req.user?.role !== 'admin') filters.active = true;

    const exercises = await Exercise.find(filters).sort({ order: 1, createdAt: 1 }).lean();
    const includeAnswers = req.user?.role === 'admin' || req.user?.role === 'professor';
    const formatted = exercises.map((e) => formatExercise(e, includeAnswers));

    if (req.user?.role === 'student') {
      const accessible = [];
      for (const ex of formatted) {
        const full = await Exercise.findById(ex._id);
        if (full && (await canAccessExercise(req, full))) accessible.push(ex);
      }
      return res.json({ data: accessible });
    }

    res.json({ data: formatted });
  } catch (err) {
    console.error('listExercises:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/exercises/:id
const getExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ error: 'NotFound', message: 'Exercise not found' });
    }
    if (!(await canAccessExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }
    const includeAnswers = req.user.role === 'admin' || req.user.role === 'professor';
    res.json(formatExercise(exercise, includeAnswers));
  } catch (err) {
    console.error('getExercise:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/exercises
const createExercise = async (req, res) => {
  try {
    const { title, bookId, chapterId, classGroupId, courseId, order, questions, passingScore, maxAttempts } = req.body;
    const groupId = classGroupId || courseId;

    if (!bookId || !chapterId) {
      return res.status(400).json({ error: 'ValidationError', message: 'bookId and chapterId are required' });
    }

    const chapter = await Chapter.findById(chapterId).select('book');
    if (!chapter || chapter.book.toString() !== bookId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Chapter does not belong to book' });
    }

    const titleObj =
      typeof title === 'string'
        ? { fr: title.trim(), en: title.trim(), ar: title.trim() }
        : title;

    if (!titleObj?.en && !titleObj?.fr) {
      return res.status(400).json({ error: 'ValidationError', message: 'title is required' });
    }

    const qs = Array.isArray(questions) ? questions : [];
    if (!qs.length) {
      return res.status(400).json({ error: 'ValidationError', message: 'At least one question is required' });
    }

    const exercise = await Exercise.create({
      title: titleObj,
      book: bookId,
      chapter: chapterId,
      classGroup: groupId || null,
      order: order ?? 0,
      questions: qs,
      passingScore: passingScore ?? 60,
      maxAttempts: maxAttempts ?? 3,
      createdBy: req.user._id,
    });

    res.status(201).json(formatExercise(exercise, true));
  } catch (err) {
    console.error('createExercise:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/exercises/:id
const updateExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ error: 'NotFound', message: 'Exercise not found' });
    }
    if (!(await canManageExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const { title, order, questions, passingScore, maxAttempts, active } = req.body;
    if (title !== undefined) {
      exercise.title =
        typeof title === 'string' ? { fr: title, en: title, ar: title } : title;
    }
    if (order !== undefined) exercise.order = order;
    if (questions !== undefined) exercise.questions = questions;
    if (passingScore !== undefined) exercise.passingScore = passingScore;
    if (maxAttempts !== undefined) exercise.maxAttempts = maxAttempts;
    if (active !== undefined) exercise.active = active;

    await exercise.save();
    res.json(formatExercise(exercise, true));
  } catch (err) {
    console.error('updateExercise:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/exercises/:id
const deleteExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ error: 'NotFound', message: 'Exercise not found' });
    }
    if (!(await canManageExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    exercise.active = false;
    await exercise.save();
    res.json({ message: 'Exercise archived', id: exercise._id });
  } catch (err) {
    console.error('deleteExercise:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/exercises/:id/submit
const submitExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise || !exercise.active) {
      return res.status(404).json({ error: 'NotFound', message: 'Exercise not found' });
    }
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }
    if (!(await canAccessExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not enrolled' });
    }

    const priorCount = await ExerciseSubmission.countDocuments({
      exercise: exercise._id,
      student: req.user._id,
      completedAt: { $ne: null },
    });
    if (priorCount >= exercise.maxAttempts) {
      return res.status(400).json({ error: 'ValidationError', message: 'Maximum attempts reached' });
    }

    const { score, maxScore, percentage, passed, needsManualReview } = scoreExercise(
      exercise,
      req.body.answers || []
    );

    const submission = await ExerciseSubmission.create({
      exercise: exercise._id,
      student: req.user._id,
      answers: req.body.answers || [],
      score,
      maxScore,
      percentage,
      passed,
      needsManualReview,
      status: needsManualReview ? 'submitted' : 'graded',
      attemptNumber: priorCount + 1,
      completedAt: new Date(),
    });

    if (!needsManualReview) {
      await notifyUser(req.user._id, {
        title: { fr: 'Exercice terminé', en: 'Exercise completed' },
        body: {
          fr: passed
            ? `Bravo ! Score : ${percentage}%`
            : `Score : ${percentage}%. Réessayez pour améliorer votre résultat.`,
          en: passed ? `Well done! Score: ${percentage}%` : `Score: ${percentage}%. Try again to improve.`,
        },
        type: 'exercise_results',
        data: { exerciseId: exercise._id, submissionId: submission._id },
      });

      const xp = passed
        ? percentage >= 100
          ? XP_REWARDS.exercise_perfect
          : XP_REWARDS.exercise_pass
        : Math.max(5, Math.round((XP_REWARDS.exercise_pass * percentage) / 100));
      await awardGamification(req.user._id, {
        xp,
        incrementExercises: passed ? 1 : 0,
      });
    }

    let progressUpdate = null;
    let groupId = exercise.classGroup;
    if (!groupId && exercise.book) {
      const linked = await ClassGroup.findOne({
        bookId: exercise.book,
        studentIds: req.user._id,
      }).select('_id');
      groupId = linked?._id;
    }
    if (groupId) {
      progressUpdate = await syncGroupChapterProgress(req.user._id, groupId);
    }

    res.json({
      submission: formatSubmission(submission),
      passed,
      percentage,
      needsManualReview,
      progress: progressUpdate,
    });
  } catch (err) {
    console.error('submitExercise:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/exercises/:id/submissions
const getSubmissions = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) {
      return res.status(404).json({ error: 'NotFound', message: 'Exercise not found' });
    }

    if (req.user.role === 'student') {
      const mine = await ExerciseSubmission.find({
        exercise: exercise._id,
        student: req.user._id,
      })
        .sort({ attemptNumber: -1 })
        .lean();
      return res.json({ data: mine.map(formatSubmission) });
    }

    if (!(await canManageExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const submissions = await ExerciseSubmission.find({ exercise: exercise._id })
      .populate('student', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ data: submissions.map(formatSubmission) });
  } catch (err) {
    console.error('getSubmissions:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/exercises/submissions/me
const getMySubmissions = async (req, res) => {
  try {
    const submissions = await ExerciseSubmission.find({ student: req.user._id })
      .populate('exercise', 'title chapter book passingScore')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: submissions.map(formatSubmission) });
  } catch (err) {
    console.error('getMySubmissions:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/exercises/submissions/:id/grade
const gradeSubmission = async (req, res) => {
  try {
    const submission = await ExerciseSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'NotFound', message: 'Submission not found' });
    }

    const exercise = await Exercise.findById(submission.exercise);
    if (!exercise || !(await canManageExercise(req, exercise))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    const { score, maxScore, feedback, passed } = req.body;
    if (score !== undefined) submission.score = Number(score);
    if (maxScore !== undefined) submission.maxScore = Number(maxScore);
    if (feedback !== undefined) submission.feedback = feedback;
    submission.percentage =
      submission.maxScore > 0 ? Math.round((submission.score / submission.maxScore) * 100) : 0;
    submission.passed =
      passed !== undefined ? passed : submission.percentage >= exercise.passingScore;
    submission.needsManualReview = false;
    submission.status = 'graded';
    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();

    await submission.save();

    await notifyUser(submission.student, {
      title: { fr: 'Exercice corrigé', en: 'Exercise graded' },
      body: {
        fr: `Votre exercice a été corrigé. Score : ${submission.percentage}%`,
        en: `Your exercise was graded. Score: ${submission.percentage}%`,
      },
      type: 'exercise_graded',
      data: { exerciseId: exercise._id, submissionId: submission._id },
    });

    res.json(formatSubmission(submission));
  } catch (err) {
    console.error('gradeSubmission:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listExercises,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise,
  submitExercise,
  getSubmissions,
  getMySubmissions,
  gradeSubmission,
};
