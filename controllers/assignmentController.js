const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const ClassGroup = require('../models/ClassGroup');
const { buildSignedFileUrl } = require('../utils/fileAccess');
const { notifyUser } = require('../utils/notifyUser');

function localizeText(obj, lang = 'fr') {
  if (!obj) return '';
  return obj[lang] || obj.fr || obj.en || obj.ar || '';
}

function signSubmissionFile(sub, req) {
  if (!sub) return sub;
  const plain = sub.toObject ? sub.toObject() : { ...sub };
  if (plain.fileUrl) {
    try {
      plain.fileUrl = buildSignedFileUrl(plain.fileUrl, req.user._id, req);
    } catch {
      delete plain.fileUrl;
    }
  }
  return plain;
}

function isGroupProfessor(group, userId) {
  return group?.professorId && group.professorId.toString() === userId.toString();
}

function isGroupStudent(group, userId) {
  return (group?.studentIds || []).some((id) => id && id.toString() === userId.toString());
}

async function assertGroupProfessorOrAdmin(req, group) {
  if (req.user.role === 'admin') return true;
  return isGroupProfessor(group, req.user._id);
}

async function loadAssignmentGroup(assignment) {
  const groupId = assignment.classGroup?._id || assignment.classGroup;
  return ClassGroup.findById(groupId);
}

// POST /api/class-groups/:classGroupId/assignments
const createAssignment = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const group = await ClassGroup.findById(classGroupId);
    if (!group) return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    if (!(await assertGroupProfessorOrAdmin(req, group))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const data = { ...req.body, classGroup: classGroupId, createdBy: req.user._id };
    delete data.course;
    const assignment = new Assignment(data);
    await assignment.save();
    res.status(201).json(assignment);
  } catch (err) {
    console.error('createAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/assignments/:id
const updateAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const group = await loadAssignmentGroup(assignment);
    if (!(await assertGroupProfessorOrAdmin(req, group))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const allowed = [
      'title',
      'description',
      'dueAt',
      'maxScore',
      'type',
      'allowLateSubmission',
      'maxSubmissions',
    ];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) assignment[key] = req.body[key];
    });
    await assignment.save();
    res.json(assignment);
  } catch (err) {
    console.error('updateAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// DELETE /api/assignments/:id
const deleteAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const group = await loadAssignmentGroup(assignment);
    if (!(await assertGroupProfessorOrAdmin(req, group))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    await AssignmentSubmission.deleteMany({ assignment: assignment._id });
    await assignment.deleteOne();
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    console.error('deleteAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/class-groups/:classGroupId/assignments
const listByClassGroup = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const group = await ClassGroup.findById(classGroupId);
    if (!group) return res.status(404).json({ error: 'NotFound', message: 'Class group not found' });
    const isMember = isGroupStudent(group, req.user._id);
    const isProfessor = isGroupProfessor(group, req.user._id);
    if (!isMember && !isProfessor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const [rows, total] = await Promise.all([
      Assignment.find({ classGroup: classGroupId })
        .sort({ dueAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Assignment.countDocuments({ classGroup: classGroupId }),
    ]);

    let data = rows;
    if (req.user.role === 'student') {
      const subs = await AssignmentSubmission.find({
        assignment: { $in: rows.map((a) => a._id) },
        student: req.user._id,
      }).lean();
      const subMap = new Map(subs.map((s) => [s.assignment.toString(), s]));
      data = rows.map((a) => ({
        ...a,
        mySubmission: signSubmissionFile(subMap.get(a._id.toString()), req),
      }));
    }

    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('listByClassGroup:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/** @deprecated alias */
const listByCourse = listByClassGroup;

// POST /api/assignments/:id/submit
const submitAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('classGroup');
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const group = assignment.classGroup;
    const isMember = isGroupStudent(group, req.user._id);
    if (!isMember || req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Only enrolled students can submit' });
    }

    const now = new Date();
    if (assignment.dueAt && now > new Date(assignment.dueAt) && !assignment.allowLateSubmission) {
      return res.status(403).json({ error: 'Forbidden', message: 'Submission deadline has passed' });
    }

    const { content, comment } = req.body;
    const fileUrl = req.file ? `uploads/documents/${req.file.filename}` : req.body.fileUrl;

    if (!content && !fileUrl && !comment) {
      return res.status(400).json({ error: 'BadRequest', message: 'Content or file is required' });
    }

    let sub = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: req.user._id,
    });

    if (sub && sub.status === 'graded') {
      return res.status(403).json({ error: 'Forbidden', message: 'Graded submissions cannot be changed' });
    }

    const maxAttempts = assignment.maxSubmissions || 1;
    if (sub && sub.attemptCount >= maxAttempts) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Maximum number of submissions (${maxAttempts}) reached`,
      });
    }

    if (sub) {
      sub.content = content !== undefined ? content : sub.content;
      sub.comment = comment !== undefined ? comment : sub.comment;
      if (fileUrl) sub.fileUrl = fileUrl;
      sub.submittedAt = now;
      sub.status = 'submitted';
      sub.attemptCount = (sub.attemptCount || 1) + 1;
      await sub.save();
    } else {
      sub = new AssignmentSubmission({
        assignment: assignment._id,
        student: req.user._id,
        content: content || '',
        fileUrl: fileUrl || '',
        comment: comment || '',
        status: 'submitted',
        attemptCount: 1,
      });
      await sub.save();
    }

    sub = await AssignmentSubmission.findById(sub._id)
      .populate('assignment', 'title dueAt maxScore')
      .populate('student', 'firstName lastName');
    res.status(201).json(signSubmissionFile(sub, req));
  } catch (err) {
    console.error('submitAssignment:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/assignments/submissions/:submissionId/grade
const gradeSubmission = async (req, res) => {
  try {
    const id = req.params.submissionId || req.params.id;
    const sub = await AssignmentSubmission.findById(id).populate('assignment');
    if (!sub) return res.status(404).json({ error: 'NotFound', message: 'Submission not found' });
    const group = await ClassGroup.findById(sub.assignment.classGroup);
    if (!(await assertGroupProfessorOrAdmin(req, group))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const { score, maxScore, feedback } = req.body;
    if (score === undefined || score === null) {
      return res.status(400).json({ error: 'BadRequest', message: 'score is required' });
    }
    sub.score = score;
    sub.maxScore = maxScore ?? sub.assignment.maxScore;
    sub.feedback = feedback;
    sub.status = 'graded';
    sub.gradedAt = new Date();
    sub.gradedBy = req.user._id;
    await sub.save();

    const assignmentTitle = localizeText(sub.assignment.title);
    await notifyUser(sub.student, {
      title: {
        fr: 'Devoir corrigé',
        en: 'Assignment graded',
        ar: 'تم تصحيح الواجب',
      },
      body: {
        fr: `Votre devoir « ${assignmentTitle} » a été noté : ${score}/${sub.maxScore}.`,
        en: `Your assignment "${assignmentTitle}" was graded: ${score}/${sub.maxScore}.`,
        ar: `تم تقييم واجبك "${assignmentTitle}": ${score}/${sub.maxScore}.`,
      },
      type: 'assignment_graded',
      data: {
        assignmentId: sub.assignment._id.toString(),
        submissionId: sub._id.toString(),
        classGroupId: group._id.toString(),
        score,
        maxScore: sub.maxScore,
      },
    });

    const updated = await AssignmentSubmission.findById(sub._id)
      .populate('assignment', 'title')
      .populate('student', 'firstName lastName')
      .populate('gradedBy', 'firstName lastName');
    res.json(signSubmissionFile(updated, req));
  } catch (err) {
    console.error('gradeSubmission:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/assignments/:id/submissions
const getSubmissions = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('classGroup');
    if (!assignment) return res.status(404).json({ error: 'NotFound', message: 'Assignment not found' });
    const group = assignment.classGroup;
    const isProfessor = isGroupProfessor(group, req.user._id);
    const isAdmin = req.user.role === 'admin';
    const filter = { assignment: assignment._id };
    if (req.user.role === 'student' && !isProfessor && !isAdmin) {
      filter.student = req.user._id;
    } else if (!isProfessor && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    if (req.query.status) filter.status = req.query.status;
    const [rows, total] = await Promise.all([
      AssignmentSubmission.find(filter)
        .populate('assignment', 'title maxScore dueAt')
        .populate('student', 'firstName lastName email')
        .sort({ submittedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AssignmentSubmission.countDocuments(filter),
    ]);
    const data = rows.map((row) => signSubmissionFile(row, req));
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('getSubmissions:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listByClassGroup,
  listByCourse,
  submitAssignment,
  gradeSubmission,
  getSubmissions,
};
