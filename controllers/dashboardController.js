const Class = require('../models/Class');
const ClassGroup = require('../models/ClassGroup');
const Document = require('../models/Document');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const {
  getStudentVisibleClassFilter,
  syncStudentCohortSessions,
  fetchStudentScheduleSessions,
} = require('../utils/studentClassVisibility');

// GET /api/dashboard/student
const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await ClassGroup.find({ studentIds: userId })
      .populate('professorId', 'firstName lastName')
      .lean();
    const enrolledCount = groups.length;

    const enrollments = await Enrollment.find({
      student: userId,
      status: { $in: ['active', 'completed'] },
    })
      .select('classGroup progress')
      .lean();
    const progressByGroup = new Map(
      enrollments.map((e) => [e.classGroup.toString(), e.progress || 0])
    );

    let totalProgress = 0;
    const enrolledGroupsWithProgress = groups.map((g) => {
      const progress = progressByGroup.get(g._id.toString()) || 0;
      totalProgress += progress;
      return {
        classGroupId: g._id,
        classGroup: { _id: g._id, name: g.name },
        progress,
      };
    });
    const averageProgress = enrolledCount
      ? Math.round(totalProgress / enrolledCount)
      : 0;

    await syncStudentCohortSessions(userId);

    const upcomingClasses = await fetchStudentScheduleSessions(userId, {
      limit: 20,
      days: 90,
    });
    const now = new Date();
    const groupIds = groups.map((g) => g._id);
    const visibility = await getStudentVisibleClassFilter(userId);
    const visibleClassIds = (await Class.find(visibility).select('_id').lean()).map(
      (x) => x._id
    );
    const recentDocuments = await Document.find({ classGroup: { $in: groupIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title classGroup createdAt')
      .lean();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAttendance = await Attendance.find({
      student: userId,
      createdAt: { $gte: startOfMonth },
    });
    const sessionsAttended = monthAttendance.filter((a) => a.status === 'present').length;
    const sessionsTotal = await Class.countDocuments({
      _id: { $in: visibleClassIds },
      type: 'live',
      status: { $in: ['completed', 'ongoing'] },
      'schedule.startTime': { $gte: startOfMonth },
    });
    const monthPercentage = sessionsTotal
      ? Math.round((sessionsAttended / sessionsTotal) * 100)
      : 0;

    res.json({
      enrolledGroupsCount: enrolledCount,
      enrolledCoursesCount: enrolledCount,
      learningTimeHours: 0,
      averageProgress,
      upcomingClassesCount: upcomingClasses.length,
      upcomingClasses,
      recentDocuments: recentDocuments.map((d) => ({
        _id: d._id,
        title: d.title,
        classGroupId: d.classGroup,
        createdAt: d.createdAt,
      })),
      attendanceSummary: { monthPercentage, sessionsAttended, sessionsTotal },
      enrolledGroupsWithProgress,
      enrolledCoursesWithProgress: enrolledGroupsWithProgress,
    });
  } catch (err) {
    console.error('getStudentDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/professor
const getProfessorDashboard = async (req, res) => {
  try {
    const groups = await ClassGroup.find({ professorId: req.user._id }).lean();
    const activeGroupsCount = groups.filter((g) => g.status === 'active').length;
    let totalStudentsCount = 0;
    const groupStats = groups.map((g) => {
      const count = (g.studentIds || []).length;
      totalStudentsCount += count;
      return {
        classGroupId: g._id,
        name: g.name || '',
        enrolledCount: count,
      };
    });

    const groupIds = groups.map((g) => g._id);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    const todaysSessions = await Class.find({
      classGroupId: { $in: groupIds },
      type: 'live',
      'schedule.startTime': { $gte: dayStart, $lte: dayEnd },
    })
      .populate('classGroupId', 'name')
      .sort('schedule.startTime')
      .lean();

    const upcomingClasses = await Class.find({
      classGroupId: { $in: groupIds },
      type: 'live',
      status: 'scheduled',
      'schedule.startTime': { $gt: new Date() },
    }).limit(10);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const classIds = (
      await Class.find({ classGroupId: { $in: groupIds } }).select('_id')
    ).map((c) => c._id);
    const monthAttendance = await Attendance.countDocuments({
      class: { $in: classIds },
      status: 'present',
      createdAt: { $gte: startOfMonth },
    });
    const monthTotal = await Attendance.countDocuments({
      class: { $in: classIds },
      createdAt: { $gte: startOfMonth },
    });
    const monthPercentage = monthTotal
      ? Math.round((monthAttendance / monthTotal) * 100)
      : 0;

    res.json({
      activeGroupsCount,
      activeCoursesCount: activeGroupsCount,
      totalStudentsCount,
      upcomingClassesCount: upcomingClasses.length,
      todaysSessions: todaysSessions.map((s) => ({
        _id: s._id,
        title: s.title,
        schedule: s.schedule,
        classGroupId: s.classGroupId?._id || s.classGroupId,
      })),
      groupStats,
      courseStats: groupStats,
      attendanceOverview: {
        monthPercentage,
        period: `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`,
      },
      averageRating: 0,
    });
  } catch (err) {
    console.error('getProfessorDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/admin
const getAdminDashboard = async (req, res) => {
  try {
    const [userStats, groupStats, activeSessions] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            students: {
              $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] },
            },
            professors: {
              $sum: { $cond: [{ $eq: ['$role', 'professor'] }, 1, 0] },
            },
            admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
          },
        },
      ]).then(
        (r) => r[0] || { total: 0, students: 0, professors: 0, admins: 0 }
      ),
      ClassGroup.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            archived: {
              $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] },
            },
            totalEnrollments: {
              $sum: { $size: { $ifNull: ['$studentIds', []] } },
            },
          },
        },
      ]).then(
        (r) => r[0] || { total: 0, active: 0, archived: 0, totalEnrollments: 0 }
      ),
      Class.countDocuments({ type: 'live', status: 'ongoing' }),
    ]);

    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthUsers = await User.countDocuments({ createdAt: { $lt: new Date() } });
    const prevCount = await User.countDocuments({ createdAt: { $lt: lastMonth } });
    const enrollmentGrowthPercent = prevCount
      ? Math.round(((lastMonthUsers - prevCount) / prevCount) * 100)
      : 0;

    const statusRows = await User.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = {
      invited: 0,
      pending: 0,
      verified: 0,
      reglo: 0,
      suspended: 0,
    };
    statusRows.forEach((row) => {
      if (row._id && Object.prototype.hasOwnProperty.call(byStatus, row._id)) {
        byStatus[row._id] = row.count;
      }
    });

    const [presentOrLate, totalAttendance] = await Promise.all([
      Attendance.countDocuments({ status: { $in: ['present', 'late'] } }),
      Attendance.countDocuments({}),
    ]);
    const attendanceRatePercent = totalAttendance
      ? Math.round((presentOrLate / totalAttendance) * 100)
      : 0;

    res.json({
      totalStudents: userStats.students,
      totalProfessors: userStats.professors,
      totalClassGroups: groupStats.total,
      totalCourses: groupStats.total,
      activeSessionsCount: activeSessions,
      enrollmentGrowthPercent,
      attendanceRatePercent,
      userStats: {
        total: userStats.total,
        students: userStats.students,
        professors: userStats.professors,
        admins: userStats.admins,
        byStatus,
      },
      groupStats: {
        total: groupStats.total,
        active: groupStats.active,
        archived: groupStats.archived,
        totalEnrollments: groupStats.totalEnrollments,
      },
      courseStats: {
        total: groupStats.total,
        published: groupStats.active,
        draft: groupStats.archived,
        totalEnrollments: groupStats.totalEnrollments,
      },
    });
  } catch (err) {
    console.error('getAdminDashboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/dashboard/student/schedule
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

module.exports = {
  getStudentDashboard,
  getProfessorDashboard,
  getAdminDashboard,
  getStudentSchedule,
};
