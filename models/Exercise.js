const mongoose = require('mongoose');

const exerciseQuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['multiple_choice', 'text', 'listening', 'writing'],
      default: 'multiple_choice',
    },
    question: {
      en: { type: String, required: true },
      fr: { type: String, default: '' },
      ar: { type: String, default: '' },
    },
    options: [{ type: String }],
    correctAnswer: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    points: { type: Number, default: 1, min: 0 },
  },
  { _id: true }
);

const exerciseSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, required: true },
      fr: { type: String, default: '' },
      ar: { type: String, default: '' },
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: [true, 'Book is required'],
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      required: [true, 'Chapter is required'],
    },
    classGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      default: null,
    },
    order: { type: Number, default: 0 },
    questions: [exerciseQuestionSchema],
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    active: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

const exerciseSubmissionSchema = new mongoose.Schema(
  {
    exercise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    answers: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        answer: { type: String, default: '' },
      },
    ],
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['submitted', 'graded'],
      default: 'submitted',
    },
    needsManualReview: { type: Boolean, default: false },
    feedback: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    attemptNumber: { type: Number, default: 1 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

exerciseSchema.index({ book: 1, chapter: 1, order: 1 });
exerciseSchema.index({ chapter: 1, active: 1 });
exerciseSubmissionSchema.index({ exercise: 1, student: 1, attemptNumber: 1 }, { unique: true });
exerciseSubmissionSchema.index({ exercise: 1, needsManualReview: 1 });

const Exercise = mongoose.model('Exercise', exerciseSchema);
const ExerciseSubmission = mongoose.model('ExerciseSubmission', exerciseSubmissionSchema);

module.exports = { Exercise, ExerciseSubmission };
