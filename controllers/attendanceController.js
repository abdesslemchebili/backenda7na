const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Course = require('../models/Course');
const ClassGroup = require('../models/ClassGroup');
const XLSX = require('xlsx');
const {
  professorOwnsCourse,
  professorTeachesStudent,
  studentEnrolledInClass,
  assertExportAccess
} = require('../utils/attendanceAuth');
const { enrollStudentInCourseFromClassGroup } = require('../utils/courseEnrollment');

// POST /api/classes/:classId/attendance - mark attendance (professor/admin only)
const markAttendance = async (req, res) => {
  try {
    const classId = req.params.classId || req.params.id;
    const { studentId, status, joinedAt, leftAt } = req.body;
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({ error: 'NotFound', message: 'Class not found' });
    }

    const course = await Course.findById(classDoc.course);
    if (!course) {
      return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    }

    const isProfessor = req.user.role === 'professor' && course.professor.toString() === req.user._id.toString();
    const isClassProfessor = classDoc.professor && classDoc.professor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isProfessor && !isClassProfessor) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }

    if (!studentId) {
      return res.status(400).json({ error: 'BadRequest', message: 'studentId is required' });
    }

    const enrolled = await studentEnrolledInClass(studentId, classDoc);
    if (!enrolled) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Étudiant non inscrit à cette session / cohorte / cours'
      });
    }

    // Rattrapage inscription cours + session si l'élève est seulement en cohorte
    if (classDoc.classGroupId) {
      try {
        const group = await ClassGroup.findById(classDoc.classGroupId);
        if (group) {
          await enrollStudentInCourseFromClassGroup(studentId, group);
        }
      } catch (enrollErr) {
        console.error('markAttendance enrollCourse:', enrollErr.message);
      }
    }
    const sidStr = studentId.toString();
    const onSession = (classDoc.enrolledStudents || []).some(
      (e) => e.student && e.student.toString() === sidStr
    );
    if (!onSession) {
      classDoc.enrolledStudents.push({ student: studentId, enrolledAt: new Date() });
      await classDoc.save();
    }

    let att = await Attendance.findOne({ class: classId, student: studentId });
    const payload = {
      class: classId,
      student: studentId,
      status: status || 'present',
      joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
      leftAt: leftAt ? new Date(leftAt) : undefined
    };
    if (att) {
      att = await Attendance.findByIdAndUpdate(att._id, payload, { new: true }).populate('class student');
    } else {
      att = new Attendance(payload);
      await att.save();
      att = await Attendance.findById(att._id).populate('class student');
    }
    res.json({ message: 'Attendance recorded', attendance: att });
  } catch (err) {
    console.error('markAttendance:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/attendance/course/:courseId or /api/courses/:courseId/attendance
const getByCourse = async (req, res) => {
  try {
    const courseId = req.params.courseId || req.params.id;
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    }
    const isProfessor = req.user.role === 'professor' && course.professor.toString() === req.user._id.toString();
    if (!isProfessor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const classIds = (await Class.find({ course: courseId }).select('_id')).map(c => c._id);
    const { classId, from, to, page = 1, limit = 20 } = req.query;
    const filter = { class: { $in: classIds } };
    if (classId) filter.class = classId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const [data, total] = await Promise.all([
      Attendance.find(filter).populate('class', 'title schedule').populate('student', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Attendance.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error('getByCourse:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/attendance/student/:studentId or /api/users/me/attendance
const getByStudent = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id.toString();
    if (req.user.role === 'student' && studentId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Can only view own attendance' });
    }

    if (req.user.role === 'professor' && studentId !== req.user._id.toString()) {
      const allowed = await professorTeachesStudent(req.user._id, studentId);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to view this student' });
      }
    }

    const { courseId, from, to, page = 1, limit = 20 } = req.query;
    const filter = { student: studentId };
    if (courseId) {
      if (req.user.role === 'professor') {
        const owns = await professorOwnsCourse(req.user._id, courseId);
        if (!owns) {
          return res.status(403).json({ error: 'Forbidden', message: 'Not authorized for this course' });
        }
      }
      const classIds = (await Class.find({ course: courseId }).select('_id')).map(c => c._id);
      filter.class = { $in: classIds };
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id }).select('_id');
      const classIds = (await Class.find({ course: { $in: courses.map((c) => c._id) } }).select('_id')).map((c) => c._id);
      filter.class = { $in: classIds };
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const [data, total] = await Promise.all([
      Attendance.find(filter).populate('class', 'title schedule course').populate('student', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Attendance.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error('getByStudent:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/attendance/export
const exportAttendance = async (req, res) => {
  try {
    const { courseId, classId, from, to, format = 'csv' } = req.query;
    if (!courseId && !classId) {
      return res.status(400).json({ error: 'BadRequest', message: 'courseId or classId required' });
    }

    const access = await assertExportAccess(req, { courseId, classId });
    if (!access.ok) {
      return res.status(access.status || 403).json({ error: 'Forbidden', message: access.message });
    }

    const filter = {};
    if (classId) filter.class = classId;
    else if (courseId) {
      const classIds = (await Class.find({ course: courseId }).select('_id')).map(c => c._id);
      filter.class = { $in: classIds };
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const list = await Attendance.find(filter).populate('class', 'title schedule').populate('student', 'firstName lastName email').lean();
    if (format === 'csv') {
      const header = 'Class,Student,Status,Joined At,Left At\n';
      const rows = list.map(a => {
        const cls = a.class && a.class.title ? (a.class.title.en || a.class.title.fr || '') : '';
        const stu = a.student ? `${a.student.firstName || ''} ${a.student.lastName || ''}`.trim() : '';
        return `"${cls}","${stu}","${a.status || ''}","${a.joinedAt || ''}","${a.leftAt || ''}"`;
      }).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(header + rows);
    }
    if (format === 'xlsx') {
      const headers = ['Class', 'Student', 'Status', 'Joined At', 'Left At'];
      const rows = list.map(a => {
        const cls = a.class && a.class.title ? (a.class.title.en || a.class.title.fr || '') : '';
        const stu = a.student ? `${a.student.firstName || ''} ${a.student.lastName || ''}`.trim() : '';
        return [cls, stu, a.status || '', a.joinedAt ? new Date(a.joinedAt).toISOString() : '', a.leftAt ? new Date(a.leftAt).toISOString() : ''];
      });
      const wsData = [headers, ...rows];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      return res.send(buf);
    }
    res.json({ data: list });
  } catch (err) {
    console.error('exportAttendance:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { markAttendance, getByCourse, getByStudent, exportAttendance };
