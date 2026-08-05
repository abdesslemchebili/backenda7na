const mongoose = require('mongoose');
const { GERMAN_SUB_LEVELS } = require('../constants/germanLevels');

const examQuestionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['multiple_choice', 'text', 'listening', 'writing'],
    required: true
  },
  question: {
    en: { type: String, required: true },
    fr: { type: String, default: '' }
  },
  options: [{ type: String }],
  correctAnswer: { type: String, default: '' },
  audioUrl: { type: String, default: '' },
  points: { type: Number, default: 1, min: 0 }
}, { _id: true });

const examSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, required: true },
      fr: { type: String, default: '' }
    },
    subLevel: {
      type: String,
      enum: GERMAN_SUB_LEVELS,
      required: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    questions: [examQuestionSchema],
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    timeLimitMinutes: { type: Number, default: 90 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const examSubmissionSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answers: [{
      questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
      answer: { type: String, default: '' }
    }],
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    manualOverride: { type: Boolean, default: false },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

examSchema.index({ subLevel: 1, isActive: 1 });
examSubmissionSchema.index({ student: 1, exam: 1 }, { unique: true });

const Exam = mongoose.model('Exam', examSchema);
const ExamSubmission = mongoose.model('ExamSubmission', examSubmissionSchema);

module.exports = { Exam, ExamSubmission };
