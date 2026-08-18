const ClassGroup = require('../models/ClassGroup');
const Chapter = require('../models/Chapter');
const ChapterProgress = require('../models/ChapterProgress');
const Enrollment = require('../models/Enrollment');
const { Exercise, ExerciseSubmission } = require('../models/Exercise');
const { LearningGame, GamePlay } = require('../models/LearningGame');
const Class = require('../models/Class');

const GAME_COMPLETE_SCORE = 50;

async function isGroupMember(studentId, classGroupId) {
  const group = await ClassGroup.findById(classGroupId).select('studentIds bookId');
  if (!group) return { ok: false, group: null };
  const enrolled = (group.studentIds || []).some(
    (id) => id?.toString() === studentId.toString()
  );
  return { ok: enrolled, group };
}

async function gatherChapterActivity(studentId, classGroupId, bookId, chapterIds) {
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
    classGroupId,
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

async function syncGroupChapterProgress(studentId, classGroupId) {
  const { ok, group } = await isGroupMember(studentId, classGroupId);
  if (!ok || !group) return null;

  const bookId = group.bookId;
  if (!bookId) {
    return { classGroupId, bookId: null, overallProgress: 0, chapters: [] };
  }

  const chapters = await Chapter.find({ book: bookId, status: 'published' }).sort({ order: 1 });
  if (!chapters.length) {
    return { classGroupId, bookId, overallProgress: 0, chapters: [] };
  }

  const chapterIds = chapters.map((c) => c._id);
  const activity = await gatherChapterActivity(studentId, classGroupId, bookId, chapterIds);

  const results = [];
  let prevCompleted = true;
  let completedCount = 0;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const derived = deriveChapterStatus(ch._id, i, chapters, activity, prevCompleted);

    if (derived.status === 'completed') completedCount += 1;
    prevCompleted = derived.status === 'completed';

    const doc = await ChapterProgress.findOneAndUpdate(
      { student: studentId, classGroup: classGroupId, chapter: ch._id },
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

  await Enrollment.findOneAndUpdate(
    { student: studentId, classGroup: classGroupId, status: 'active' },
    { progress: overallProgress, status: overallProgress >= 100 ? 'completed' : 'active' }
  );

  return {
    classGroupId: classGroupId.toString(),
    bookId: bookId.toString(),
    overallProgress,
    completedChapters: completedCount,
    totalChapters: chapters.length,
    chapters: results,
  };
}

/** @deprecated alias */
const syncCourseChapterProgress = syncGroupChapterProgress;

async function getGroupLeaderboard(classGroupId, limit = 10) {
  const group = await ClassGroup.findById(classGroupId)
    .populate('studentIds', 'firstName lastName studentInfo.gamification')
    .select('studentIds name');
  if (!group) return [];

  const enrollments = await Enrollment.find({
    classGroup: classGroupId,
    status: { $in: ['active', 'completed'] },
  }).select('student progress');
  const progressByStudent = new Map(
    enrollments.map((e) => [e.student.toString(), e.progress || 0])
  );

  const rows = (group.studentIds || [])
    .filter((s) => s)
    .map((s) => {
      const gam = s.studentInfo?.gamification || {};
      return {
        studentId: s._id.toString(),
        firstName: s.firstName,
        lastName: s.lastName,
        displayName: `${s.firstName} ${s.lastName}`.trim(),
        progress: progressByStudent.get(s._id.toString()) || 0,
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

/** @deprecated alias */
const getCourseLeaderboard = getGroupLeaderboard;

module.exports = {
  syncGroupChapterProgress,
  syncCourseChapterProgress,
  getGroupLeaderboard,
  getCourseLeaderboard,
  GAME_COMPLETE_SCORE,
};
