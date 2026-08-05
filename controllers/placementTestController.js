const { PlacementTest, PlacementTestSubmission } = require('../models/PlacementTest');
const User = require('../models/User');
const ClassGroup = require('../models/ClassGroup');
const { subLevelToMainLevel } = require('../constants/germanLevels');
const { notifyUser } = require('../utils/notifyUser');
const { enrollStudentInCourseFromClassGroup } = require('../utils/courseEnrollment');

function scoreSubmission(test, answers) {
  let score = 0;
  let maxScore = 0;
  let needsManualReview = false;
  const answerMap = new Map(answers.map((a) => [String(a.questionId), a.answer]));

  for (const q of test.questions) {
    maxScore += q.points || 1;
    const studentAnswer = answerMap.get(String(q._id)) || '';
    if (q.type === 'multiple_choice' && studentAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase()) {
      score += q.points || 1;
    } else if (['text', 'writing', 'listening'].includes(q.type) && studentAnswer.trim().length > 0) {
      needsManualReview = true;
    }
  }

  let determinedLevel = 'A1';
  const thresholds = [...(test.levelThresholds || [])].sort((a, b) => b.minScore - a.minScore);
  for (const t of thresholds) {
    if (score >= t.minScore) {
      determinedLevel = t.level;
      break;
    }
  }

  return { score, maxScore, determinedLevel, needsManualReview };
}

// GET /api/placement-tests/active — student
const getActivePlacementTest = async (req, res) => {
  try {
    const test = await PlacementTest.findOne({ isActive: true }).select('-questions.correctAnswer');
    if (!test) return res.status(404).json({ message: 'No active placement test' });

    const existing = await PlacementTestSubmission.findOne({ student: req.user._id });
    if (existing?.completedAt) {
      return res.json({ test: null, submission: existing, completed: true });
    }

    res.json({ test, submission: existing, completed: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/placement-tests/submit — student
const submitPlacementTest = async (req, res) => {
  try {
    const { answers } = req.body;
    const test = await PlacementTest.findOne({ isActive: true });
    if (!test) return res.status(404).json({ message: 'No active placement test' });

    const existing = await PlacementTestSubmission.findOne({ student: req.user._id });
    if (existing?.completedAt) {
      return res.status(400).json({ message: 'Placement test already completed' });
    }

    const { score, maxScore, determinedLevel, needsManualReview } = scoreSubmission(test, answers || []);

    const submission = existing || new PlacementTestSubmission({ student: req.user._id, placementTest: test._id });
    submission.answers = answers || [];
    submission.score = score;
    submission.maxScore = maxScore;
    submission.determinedLevel = determinedLevel;
    submission.needsManualReview = needsManualReview;
    submission.completedAt = new Date();
    await submission.save();

    const user = await User.findById(req.user._id);
    user.studentInfo.placementTestCompleted = true;
    user.studentInfo.placementLevel = determinedLevel;
    if (!user.studentInfo.germanSubLevel) {
      user.studentInfo.germanSubLevel = `${determinedLevel}.1`;
    }
    await user.save();

    res.json({ submission, determinedLevel, needsManualReview });
  } catch (err) {
    console.error('submitPlacementTest:', err);
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/placement-tests/submissions/:studentId/override — admin
const overridePlacementLevel = async (req, res) => {
  try {
    const { level, subLevel, classGroupId } = req.body;
    const submission = await PlacementTestSubmission.findOne({ student: req.params.studentId });
    if (!submission) return res.status(404).json({ message: 'Submission not found' });

    submission.overrideHistory = submission.overrideHistory || [];
    submission.overrideHistory.push({
      adminId: req.user._id,
      level: level || submission.determinedLevel,
      subLevel: subLevel || null,
      classGroupId: classGroupId || null,
      at: new Date()
    });

    if (level) submission.adminOverrideLevel = level;
    await submission.save();

    const user = await User.findById(req.params.studentId);
    if (!user) return res.status(404).json({ message: 'Student not found' });

    if (level) user.studentInfo.placementLevel = level;
    if (subLevel) user.studentInfo.germanSubLevel = subLevel;
    user.studentInfo.placementTestCompleted = true;

    if (classGroupId) {
      const group = await ClassGroup.findById(classGroupId);
      if (group) {
        if (!group.studentIds.some((id) => id.toString() === user._id.toString())) {
          group.studentIds.push(user._id);
          await group.save();
        }
        user.studentInfo.classGroupId = group._id;
        await enrollStudentInCourseFromClassGroup(user._id, group);
      }
    }
    await user.save();

    res.json({ submission, user: { _id: user._id, studentInfo: user.studentInfo } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin CRUD
const listPlacementTests = async (req, res) => {
  const tests = await PlacementTest.find().sort({ createdAt: -1 });
  res.json({ data: tests });
};

const createPlacementTest = async (req, res) => {
  const test = await PlacementTest.create(req.body);
  res.status(201).json(test);
};

const updatePlacementTest = async (req, res) => {
  const test = await PlacementTest.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!test) return res.status(404).json({ message: 'Not found' });
  res.json(test);
};

module.exports = {
  getActivePlacementTest,
  submitPlacementTest,
  overridePlacementLevel,
  listPlacementTests,
  createPlacementTest,
  updatePlacementTest
};
