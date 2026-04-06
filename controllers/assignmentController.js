const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Course = require('../models/Course');

// POST /api/courses/:courseId/assignments
const createAssignment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const data = { ...req.body, course: courseId, createdBy: req.user._id };
    const assignment = new Assignment(data);
    await assignment.save();
    res.status(201).json(assignment);
  } catch (err) {
    console.error('createAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/courses/:courseId/assignments
const listByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'NotFound', message: 'Course not found' });
    const isEnrolled = course.enrolledStudents.some(e => e.student && e.student.toString() === req.user._id.toString());
    const isProfessor = course.professor.toString() === req.user._id.toString();
    if (!isEnrolled && !isProfessor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const [data, total] = await Promise.all([
      Assignment.find({ course: courseId }).sort({ dueAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Assignment.countDocuments({ course: courseId })
    ]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('listByCourse:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/assignments/:id/submit
const submitAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('course');
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const course = assignment.course;
    const isEnrolled = course.enrolledStudents.some(e => e.student && e.student.toString() === req.user._id.toString());
    if (!isEnrolled || req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Only enrolled students can submit' });
    }
    const { content, comment } = req.body;
    const fileUrl = req.file ? (process.env.API_URL || '') + '/uploads/documents/' + req.file.filename : req.body.fileUrl;
    let sub = await AssignmentSubmission.findOne({ assignment: assignment._id, student: req.user._id });
    if (sub) {
      sub.content = content !== undefined ? content : sub.content;
      sub.comment = comment !== undefined ? comment : sub.comment;
      if (fileUrl) sub.fileUrl = fileUrl;
      sub.submittedAt = new Date();
      sub.status = 'submitted';
      await sub.save();
    } else {
      sub = new AssignmentSubmission({
        assignment: assignment._id,
        student: req.user._id,
        content: content || '',
        fileUrl: fileUrl || '',
        comment: comment || '',
        status: 'submitted'
      });
      await sub.save();
    }
    sub = await AssignmentSubmission.findById(sub._id).populate('assignment', 'title').populate('student', 'firstName lastName');
    res.status(201).json(sub);
  } catch (err) {
    console.error('submitAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/assignments/submissions/:submissionId/grade or /api/submissions/:id/grade
const gradeSubmission = async (req, res) => {
  try {
    const id = req.params.submissionId || req.params.id;
    const sub = await AssignmentSubmission.findById(id).populate('assignment');
    if (!sub) return res.status(404).json({ error: 'NotFound', message: 'Submission not found' });
    const course = await Course.findById(sub.assignment.course);
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const { score, maxScore, feedback } = req.body;
    sub.score = score;
    sub.maxScore = maxScore ?? sub.assignment.maxScore;
    sub.feedback = feedback;
    sub.status = 'graded';
    sub.gradedAt = new Date();
    sub.gradedBy = req.user._id;
    await sub.save();
    const updated = await AssignmentSubmission.findById(sub._id)
      .populate('assignment', 'title').populate('student', 'firstName lastName').populate('gradedBy', 'firstName lastName');
    res.json(updated);
  } catch (err) {
    console.error('gradeSubmission:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/assignments/:id/submissions
const getSubmissions = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('course');
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const course = assignment.course;
    const isProfessor = course.professor.toString() === req.user._id.toString();
    const filter = { assignment: assignment._id };
    if (req.user.role === 'student' && !isProfessor && req.user.role !== 'admin') {
      filter.student = req.user._id;
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    if (req.query.status) filter.status = req.query.status;
    const [data, total] = await Promise.all([
      AssignmentSubmission.find(filter).populate('assignment', 'title').populate('student', 'firstName lastName').sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AssignmentSubmission.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('getSubmissions:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { createAssignment, listByCourse, submitAssignment, gradeSubmission, getSubmissions };
