const { Exam, ExamSubmission } = require('../models/Exam');
const User = require('../models/User');
const { getNextSubLevel } = require('../constants/germanLevels');
const { notifyUser } = require('../utils/notifyUser');

function scoreExam(exam, answers) {
  let score = 0;
  let maxScore = 0;
  const answerMap = new Map(answers.map((a) => [String(a.questionId), a.answer]));

  for (const q of exam.questions) {
    maxScore += q.points || 1;
    const studentAnswer = answerMap.get(String(q._id)) || '';
    if (q.type === 'multiple_choice' && studentAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase()) {
      score += q.points || 1;
    } else if (['text', 'writing'].includes(q.type) && studentAnswer.trim().length > 0) {
      score += Math.floor((q.points || 1) * 0.5);
    }
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return { score, maxScore, percentage, passed: percentage >= exam.passingScore };
}

// GET /api/exams — list by subLevel
const listExams = async (req, res) => {
  try {
    const { subLevel } = req.query;
    const filter = { isActive: true };
    if (subLevel) filter.subLevel = subLevel;
    const exams = await Exam.find(filter).select('-questions.correctAnswer').populate('createdBy', 'firstName lastName');
    res.json({ data: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams — professor/admin
const createExam = async (req, res) => {
  try {
    const exam = await Exam.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/:id
const getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('-questions.correctAnswer');
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/exams/:id/submit — student
const submitExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const existing = await ExamSubmission.findOne({ exam: exam._id, student: req.user._id });
    if (existing?.completedAt) {
      return res.status(400).json({ message: 'Exam already submitted' });
    }

    const { score, maxScore, percentage, passed } = scoreExam(exam, req.body.answers || []);

    const submission = existing || new ExamSubmission({ exam: exam._id, student: req.user._id });
    submission.answers = req.body.answers || [];
    submission.score = score;
    submission.maxScore = maxScore;
    submission.percentage = percentage;
    submission.passed = passed;
    submission.completedAt = new Date();
    await submission.save();

    const user = await User.findById(req.user._id);

    if (passed && user.studentInfo?.germanSubLevel === exam.subLevel) {
      const nextLevel = getNextSubLevel(exam.subLevel);
      if (nextLevel) {
        user.studentInfo.germanSubLevel = nextLevel;
        user.studentInfo.placementLevel = nextLevel.split('.')[0];
        await user.save();
        await notifyUser(user._id, {
          title: { fr: 'Niveau validé !', en: 'Level passed!' },
          body: { fr: `Félicitations ! Vous passez au niveau ${nextLevel}.`, en: `Congratulations! You advanced to ${nextLevel}.` },
          type: 'exam_results',
          data: { examId: exam._id, newSubLevel: nextLevel }
        });
      }
    }

    res.json({ submission, passed, percentage });
  } catch (err) {
    console.error('submitExam:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/exams/submissions/me — student results
const getMyExamSubmissions = async (req, res) => {
  try {
    const submissions = await ExamSubmission.find({ student: req.user._id })
      .populate('exam', 'title subLevel passingScore')
      .sort({ createdAt: -1 });
    res.json({ data: submissions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/exams/submissions/:id/override — admin
const overrideExamResult = async (req, res) => {
  try {
    const { passed, newSubLevel } = req.body;
    const submission = await ExamSubmission.findById(req.params.id).populate('exam');
    if (!submission) return res.status(404).json({ message: 'Submission not found' });

    if (typeof passed === 'boolean') submission.passed = passed;
    submission.manualOverride = true;
    await submission.save();

    if (passed && newSubLevel) {
      const user = await User.findById(submission.student);
      user.studentInfo.germanSubLevel = newSubLevel;
      user.studentInfo.placementLevel = newSubLevel.split('.')[0];
      await user.save();
    }

    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listExams,
  createExam,
  getExam,
  submitExam,
  getMyExamSubmissions,
  overrideExamResult
};
