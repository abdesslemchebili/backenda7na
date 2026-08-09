const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const ChapterProgress = require('../models/ChapterProgress');
const Enrollment = require('../models/Enrollment');
const { Exercise, ExerciseSubmission } = require('../models/Exercise');
const { LearningGame, GamePlay } = require('../models/LearningGame');
const Class = require('../models/Class');
const User = require('../models/User');

const GAME_COMPLETE_SCORE = 50;

async function isEnrolled(studentId, courseId) {
  const course = await Course.findById(courseId).select('enrolledStudents bookId');
  if (!course) return { ok: false, course: null };
  const enrolled = course.enrolledStudents.some(
    (e) => e.student?.toString() === studentId.toString()
  );
  return { ok: enrolled, course };
}

async function gatherChapterActivity(studentId, courseId, bookId, chapterIds) {
  const chapterSet = new Set(chapterIds.map(String));

  const exercises = await Exercise.find({ book: bookId, chapter: { $in: chapterIds }, active: true }).select('_id chapter');
  const exerciseIds = exercises.map((e) => e._id);
  const exByChapter = new Map();
  exercises.forEach((e) => {
    const list = exByChapter.get(e.chapter.toString()) || [];
    list.push(e._id.toString());
    exByChapter.set(e.chapter.toString(), list);
  });

  const passedSubs = await ExerciseSubmission.find({
    student: studentId,
    exercise: { $in: exerciseIds },
    passed: true,
    status: 'graded',
  }).select('exercise');

  const passedExByChapter = new Map();
  for (const sub of passedSubs) {
    const ex = exercises.find((e) => e._id.toString() === sub.exercise.toString());
    if (!ex) continue;
    const chId = ex.chapter.toString();
    passedExByChapter.set(chId, (passedExByChapter.get(chId) || 0) + 1);
  }

  const games = await LearningGame.find({ book: bookId, chapter: { $in: chapterIds }, active: true }).select('_id chapter');
  const gameIds = games.map((g) => g._id);
  const plays = await GamePlay.find({
    student: studentId,
    game: { $in: gameIds },
    score: { $gte: GAME_COMPLETE_SCORE },
  }).select('game score');

  const gamesByChapter = new Map();
  for (const play of plays) {
    const game = games.find((g) => g._id.toString() === play.game.toString());
    if (!game) continue;
    const chId = game.chapter.toString();
    gamesByChapter.set(chId, (gamesByChapter.get(chId) || 0) + 1);
  }

  const sessions = await Class.find({
    course: courseId,
    chapterId: { $in: chapterIds },
    status: 'completed',
  }).select('chapterId');

  const sessionsByChapter = new Map();
  sessions.forEach((s) => {
    if (!s.chapterId) return;
    const chId = s.chapterId.toString();
    if (!chapterSet.has(chId)) return;
    sessionsByChapter.set(chId, (sessionsByChapter.get(chId) || 0) + 1);
  });

  return { passedExByChapter, gamesByChapter, sessionsByChapter, exByChapter };
}

function deriveChapterStatus(chapterId, index, chapters, activity, prevCompleted) {
  const chId = chapterId.toString();
  const exercisesPassed = activity.passedExByChapter.get(chId) || 0;
  const gamesCompleted = activity.gamesByChapter.get(chId) || 0;
  const sessionsCompleted = activity.sessionsByChapter.get(chId) || 0;
  const hasExercises = (activity.exByChapter.get(chId) || []).length > 0;

  const hasActivity = exercisesPassed > 0 || gamesCompleted > 0 || sessionsCompleted > 0;

  let completed = false;
  if (hasExercises) {
    completed = exercisesPassed > 0 || gamesCompleted > 0;
  } else {
    completed = gamesCompleted > 0 || sessionsCompleted > 0;
  }

  let status = 'locked';
  if (completed) {
    status = 'completed';
  } else if (index === 0 || prevCompleted) {
    status = hasActivity ? 'in_progress' : 'available';
  } else if (hasActivity) {
    status = 'in_progress';
  }

  return {
    status,
    exercisesPassed,
    gamesCompleted,
    sessionsCompleted,
    completedAt: completed ? new Date() : null,
    lastActivityAt: hasActivity ? new Date() : null,
  };
}

async function syncCourseChapterProgress(studentId, courseId) {
  const { ok, course } = await isEnrolled(studentId, courseId);
  if (!ok || !course) return null;

  const bookId = course.bookId;
  if (!bookId) {
    return { courseId, bookId: null, overallProgress: 0, chapters: [] };
  }

  const chapters = await Chapter.find({ book: bookId, status: 'published' }).sort({ order: 1 });
  if (!chapters.length) {
    return { courseId, bookId, overallProgress: 0, chapters: [] };
  }

  const chapterIds = chapters.map((c) => c._id);
  const activity = await gatherChapterActivity(studentId, courseId, bookId, chapterIds);

  const results = [];
  let prevCompleted = true;
  let completedCount = 0;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const derived = deriveChapterStatus(ch._id, i, chapters, activity, prevCompleted);

    if (derived.status === 'completed') completedCount += 1;
    prevCompleted = derived.status === 'completed';

    const doc = await ChapterProgress.findOneAndUpdate(
      { student: studentId, course: courseId, chapter: ch._id },
      {
        book: bookId,
        status: derived.status,
        exercisesPassed: derived.exercisesPassed,
        gamesCompleted: derived.gamesCompleted,
        sessionsCompleted: derived.sessionsCompleted,
        completedAt: derived.completedAt,
        lastActivityAt: derived.lastActivityAt,
      },
      { upsert: true, new: true }
    );

    results.push({
      chapterId: ch._id.toString(),
      order: ch.order,
      status: doc.status,
      exercisesPassed: doc.exercisesPassed,
      gamesCompleted: doc.gamesCompleted,
      sessionsCompleted: doc.sessionsCompleted,
      completedAt: doc.completedAt,
    });
  }

  const overallProgress = Math.round((completedCount / chapters.length) * 100);

  const courseDoc = await Course.findById(courseId);
  if (courseDoc) {
    await courseDoc.updateStudentProgress(studentId, overallProgress);
  }

  await Enrollment.findOneAndUpdate(
    { student: studentId, course: courseId, status: 'active' },
    { progress: overallProgress, status: overallProgress >= 100 ? 'completed' : 'active' }
  );

  return {
    courseId: courseId.toString(),
    bookId: bookId.toString(),
    overallProgress,
    completedChapters: completedCount,
    totalChapters: chapters.length,
    chapters: results,
  };
}

async function getCourseLeaderboard(courseId, limit = 10) {
  const course = await Course.findById(courseId)
    .populate('enrolledStudents.student', 'firstName lastName studentInfo.gamification')
    .select('enrolledStudents title');
  if (!course) return [];

  const rows = course.enrolledStudents
    .filter((e) => e.student)
    .map((e) => {
      const s = e.student;
      const gam = s.studentInfo?.gamification || {};
      return {
        studentId: s._id.toString(),
        firstName: s.firstName,
        lastName: s.lastName,
        displayName: `${s.firstName} ${s.lastName}`.trim(),
        progress: e.progress || 0,
        totalXp: gam.totalXp || 0,
        currentStreak: gam.currentStreak || 0,
        badgesCount: (gam.badges || []).length,
      };
    });

  rows.sort((a, b) => {
    if (b.progress !== a.progress) return b.progress - a.progress;
    return b.totalXp - a.totalXp;
  });

  return rows.slice(0, limit).map((row, index) => ({ rank: index + 1, ...row }));
}

module.exports = {
  syncCourseChapterProgress,
  getCourseLeaderboard,
  GAME_COMPLETE_SCORE,
};
