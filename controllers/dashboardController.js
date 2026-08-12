const Course = require('../models/Course');
const Class = require('../models/Class');
const ClassGroup = require('../models/ClassGroup');
const Document = require('../models/Document');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { getStudentVisibleClassFilter, syncStudentCohortSessions, fetchStudentScheduleSessions } = require('../utils/studentClassVisibility');

// GET /api/dashboard/student
const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const courses = await Course.find({ 'enrolledStudents.student': userId }).populate('professor', 'firstName lastName').lean();
    const enrolledCount = courses.length;
    let learningTimeHours = 0;
    let totalProgress = 0;
    const enrolledCoursesWithProgress = courses.map(c => {
      const en = (c.enrolledStudents || []).find(e => e.student && e.student.toString() === userId.toString());
      const progress = en ? (en.progress || 0) : 0;
      totalProgress += progress;
      return { course: { _id: c._id, title: c.title }, progress };
    });
    const averageProgress = enrolledCount ? Math.round(totalProgress / enrolledCount) : 0;

    // Rattrape les inscriptions session/cours pour les cohortes déjà assignées
    await syncStudentCohortSessions(userId);

    const upcomingClasses = await fetchStudentScheduleSessions(userId, { limit: 20, days: 90 });
    const now = new Date();
    const courseIds = courses.map((c) => c._id);
    const visibility = await getStudentVisibleClassFilter(userId);
    const visibleClassIds = (
      await Class.find(visibility).select('_id').lean()
    ).map((x) => x._id);
    const recentDocuments = await Document.find({ course: { $in: courseIds } })
      .sort({ createdAt: -1 }).limit(5).select('title course createdAt').lean();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAttendance = await Attendance.find({
      student: userId,
      createdAt: { $gte: startOfMonth }
    });
    const sessionsAttended = monthAttendance.filter(a => a.status === 'present').length;
    const sessionsTotal = await Class.countDocuments({
      _id: { $in: visibleClassIds },
      type: 'live',
      status: { $in: ['completed', 'ongoing'] },
      'schedule.startTime': { $gte: startOfMonth },
    });
    const monthPercentage = sessionsTotal ? Math.round((sessionsAttended / sessionsTotal) * 100) : 0;

    res.json({
      enrolledCoursesCount: enrolledCount,
      learningTimeHours,
      averageProgress,
      upcomingClassesCount: upcomingClasses.length,
      upcomingClasses,
      recentDocuments: recentDocuments.map(d => ({ _id: d._id, title: d.title, courseId: d.course, createdAt: d.createdAt })),
      attendanceSummary: { monthPercentage, sessionsAttended, sessionsTotal },
      enrolledCoursesWithProgress
    });
  } catch (err) {
    console.error('getStudentDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/professor
const getProfessorDashboard = async (req, res) => {
  try {
    const courses = await Course.find({ professor: req.user._id }).lean();
    const activeCoursesCount = courses.filter(c => c.status === 'published').length;
    let totalStudentsCount = 0;
    const courseStats = courses.map(c => {
      const count = (c.enrolledStudents || []).length;
      totalStudentsCount += count;
      return { courseId: c._id, title: c.title?.en || c.title?.fr || '', enrolledCount: count };
    });

    const courseIds = courses.map(c => c._id);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todaysSessions = await Class.find({
      course: { $in: courseIds },
      type: 'live',
      'schedule.startTime': { $gte: dayStart, $lte: dayEnd }
    }).populate('course', 'title').sort('schedule.startTime').lean();

    const upcomingClasses = await Class.find({
      course: { $in: courseIds },
      type: 'live',
      status: 'scheduled',
      'schedule.startTime': { $gt: new Date() }
    }).limit(10);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const classIds = (await Class.find({ course: { $in: courseIds } }).select('_id')).map(c => c._id);
    const monthAttendance = await Attendance.countDocuments({ class: { $in: classIds }, status: 'present', createdAt: { $gte: startOfMonth } });
    const monthTotal = await Attendance.countDocuments({ class: { $in: classIds }, createdAt: { $gte: startOfMonth } });
    const monthPercentage = monthTotal ? Math.round((monthAttendance / monthTotal) * 100) : 0;

    res.json({
      activeCoursesCount,
      totalStudentsCount,
      upcomingClassesCount: upcomingClasses.length,
      todaysSessions: todaysSessions.map(s => ({ _id: s._id, title: s.title, schedule: s.schedule, courseId: s.course?._id })),
      courseStats,
      attendanceOverview: { monthPercentage, period: `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}` },
      averageRating: 0
    });
  } catch (err) {
    console.error('getProfessorDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/admin
const getAdminDashboard = async (req, res) => {
  try {
    const [userStats, courseStats, activeSessions] = await Promise.all([
      User.aggregate([
        { $group: { _id: null, total: { $sum: 1 }, students: { $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] } }, professors: { $sum: { $cond: [{ $eq: ['$role', 'professor'] }, 1, 0] } }, admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } } } }
      ]).then(r => r[0] || { total: 0, students: 0, professors: 0, admins: 0 }),
      Course.aggregate([
        { $group: { _id: null, total: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } }, draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } }, totalEnrollments: { $sum: { $size: { $ifNull: ['$enrolledStudents', []] } } } } }
      ]).then(r => r[0] || { total: 0, published: 0, draft: 0, totalEnrollments: 0 }),
      Class.countDocuments({ type: 'live', status: 'ongoing' })
    ]);

    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthUsers = await User.countDocuments({ createdAt: { $lt: new Date() } });
    const prevCount = await User.countDocuments({ createdAt: { $lt: lastMonth } });
    const enrollmentGrowthPercent = prevCount ? Math.round(((lastMonthUsers - prevCount) / prevCount) * 100) : 0;

    const statusRows = await User.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byStatus = {
      invited: 0,
      pending: 0,
      verified: 0,
      reglo: 0,
      suspended: 0
    };
    statusRows.forEach((row) => {
      if (row._id && Object.prototype.hasOwnProperty.call(byStatus, row._id)) {
        byStatus[row._id] = row.count;
      }
    });

    const [presentOrLate, totalAttendance] = await Promise.all([
      Attendance.countDocuments({ status: { $in: ['present', 'late'] } }),
      Attendance.countDocuments({})
    ]);
    const attendanceRatePercent = totalAttendance
      ? Math.round((presentOrLate / totalAttendance) * 100)
      : 0;

    res.json({
      totalStudents: userStats.students,
      totalProfessors: userStats.professors,
      totalCourses: courseStats.total,
      activeSessionsCount: activeSessions,
      enrollmentGrowthPercent,
      attendanceRatePercent,
      userStats: {
        total: userStats.total,
        students: userStats.students,
        professors: userStats.professors,
        admins: userStats.admins,
        byStatus
      },
      courseStats: { total: courseStats.total, published: courseStats.published, draft: courseStats.draft, totalEnrollments: courseStats.totalEnrollments }
    });
  } catch (err) {
    console.error('getAdminDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/student/schedule — planning étudiant (sessions non terminées)
const getStudentSchedule = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 180));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const data = await fetchStudentScheduleSessions(req.user._id, { days, limit });
    res.json({ data, total: data.length });
  } catch (err) {
    console.error('getStudentSchedule:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { getStudentDashboard, getProfessorDashboard, getAdminDashboard, getStudentSchedule };
