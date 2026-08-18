const ChapterProgress = require('../models/ChapterProgress');
const ClassGroup = require('../models/ClassGroup');
const {
  syncGroupChapterProgress,
  getGroupLeaderboard,
} = require('../utils/chapterProgressHelper');

async function canAccessGroupProgress(req, classGroupId) {
  if (req.user.role === 'admin') return true;
  const group = await ClassGroup.findById(classGroupId).select('professorId studentIds');
  if (!group) return false;
  if (
    req.user.role === 'professor' &&
    group.professorId?.toString() === req.user._id.toString()
  ) {
    return true;
  }
  if (req.user.role === 'student') {
    return (group.studentIds || []).some(
      (id) => id?.toString() === req.user._id.toString()
    );
  }
  return false;
}

// GET /api/progress/group/:classGroupId
const getGroupProgress = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    if (!(await canAccessGroupProgress(req, classGroupId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const studentId =
      req.user.role === 'student' ? req.user._id : req.query.studentId || req.user._id;

    if (req.user.role === 'student' && studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const synced = await syncGroupChapterProgress(studentId, classGroupId);
    if (!synced) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Class group or enrollment not found',
      });
    }

    res.json(synced);
  } catch (err) {
    console.error('getGroupProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/** @deprecated alias */
const getCourseProgress = getGroupProgress;

// POST /api/progress/group/:classGroupId/sync
const syncProgress = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }
    const synced = await syncGroupChapterProgress(req.user._id, classGroupId);
    if (!synced) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Class group or enrollment not found',
      });
    }
    res.json(synced);
  } catch (err) {
    console.error('syncProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/progress/group/:classGroupId/leaderboard
const getLeaderboard = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    if (!(await canAccessGroupProgress(req, classGroupId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const rows = await getGroupLeaderboard(classGroupId, limit);

    let myRank = null;
    if (req.user.role === 'student') {
      const full = await getGroupLeaderboard(classGroupId, 500);
      const mine = full.find((r) => r.studentId === req.user._id.toString());
      if (mine) myRank = mine.rank;
    }

    res.json({ data: rows, myRank });
  } catch (err) {
    console.error('getLeaderboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/progress/group/:classGroupId/chapters
const getChapterProgress = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    if (!(await canAccessGroupProgress(req, classGroupId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const studentId = req.user.role === 'student' ? req.user._id : req.query.studentId;
    if (!studentId) {
      return res.status(400).json({ error: 'ValidationError', message: 'studentId required' });
    }

    const rows = await ChapterProgress.find({
      student: studentId,
      classGroup: classGroupId,
    })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ data: rows });
  } catch (err) {
    console.error('getChapterProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  getGroupProgress,
  getCourseProgress,
  syncProgress,
  getLeaderboard,
  getChapterProgress,
};
