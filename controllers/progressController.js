const ChapterProgress = require('../models/ChapterProgress');
const Course = require('../models/Course');
const {
  syncCourseChapterProgress,
  getCourseLeaderboard,
} = require('../utils/chapterProgressHelper');

async function canAccessCourseProgress(req, courseId) {
  if (req.user.role === 'admin') return true;
  const course = await Course.findById(courseId).select('professor enrolledStudents');
  if (!course) return false;
  if (req.user.role === 'professor' && course.professor.toString() === req.user._id.toString()) {
    return true;
  }
  if (req.user.role === 'student') {
    return course.enrolledStudents.some((e) => e.student?.toString() === req.user._id.toString());
  }
  return false;
}

// GET /api/progress/course/:courseId
const getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!(await canAccessCourseProgress(req, courseId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const studentId =
      req.user.role === 'student' ? req.user._id : req.query.studentId || req.user._id;

    if (req.user.role === 'student' && studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const synced = await syncCourseChapterProgress(studentId, courseId);
    if (!synced) {
      return res.status(404).json({ error: 'NotFound', message: 'Course or enrollment not found' });
    }

    res.json(synced);
  } catch (err) {
    console.error('getCourseProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/progress/course/:courseId/sync
const syncProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }
    const synced = await syncCourseChapterProgress(req.user._id, courseId);
    if (!synced) {
      return res.status(404).json({ error: 'NotFound', message: 'Course or enrollment not found' });
    }
    res.json(synced);
  } catch (err) {
    console.error('syncProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/progress/course/:courseId/leaderboard
const getLeaderboard = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!(await canAccessCourseProgress(req, courseId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const rows = await getCourseLeaderboard(courseId, limit);

    let myRank = null;
    if (req.user.role === 'student') {
      const full = await getCourseLeaderboard(courseId, 500);
      const mine = full.find((r) => r.studentId === req.user._id.toString());
      if (mine) myRank = mine.rank;
    }

    res.json({ data: rows, myRank });
  } catch (err) {
    console.error('getLeaderboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/progress/course/:courseId/chapters — raw stored progress (no sync)
const getChapterProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!(await canAccessCourseProgress(req, courseId))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not allowed' });
    }

    const studentId = req.user.role === 'student' ? req.user._id : req.query.studentId;
    if (!studentId) {
      return res.status(400).json({ error: 'ValidationError', message: 'studentId required' });
    }

    const rows = await ChapterProgress.find({ student: studentId, course: courseId }).sort({ createdAt: 1 }).lean();
    res.json({ data: rows });
  } catch (err) {
    console.error('getChapterProgress:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  getCourseProgress,
  syncProgress,
  getLeaderboard,
  getChapterProgress,
};
