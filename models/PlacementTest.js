const mongoose = require('mongoose');
const { GERMAN_LEVELS } = require('../constants/germanLevels');

const questionSchema = new mongoose.Schema({
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

const placementTestSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, required: true },
      fr: { type: String, default: '' }
    },
    description: {
      en: { type: String, default: '' },
      fr: { type: String, default: '' }
    },
    questions: [questionSchema],
    levelThresholds: [{
      minScore: { type: Number, required: true },
      level: { type: String, enum: GERMAN_LEVELS, required: true }
    }],
    isActive: { type: Boolean, default: true },
    timeLimitMinutes: { type: Number, default: 60 }
  },
  { timestamps: true }
);

const placementTestSubmissionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    placementTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlacementTest',
      required: true
    },
    answers: [{
      questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
      answer: { type: String, default: '' }
    }],
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    determinedLevel: { type: String, enum: GERMAN_LEVELS, default: null },
    adminOverrideLevel: { type: String, enum: GERMAN_LEVELS, default: null },
    needsManualReview: { type: Boolean, default: false },
    overrideHistory: [{
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      level: { type: String },
      subLevel: { type: String },
      classGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassGroup' },
      at: { type: Date, default: Date.now }
    }],
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

placementTestSubmissionSchema.index({ student: 1 }, { unique: true });

const PlacementTest = mongoose.model('PlacementTest', placementTestSchema);
const PlacementTestSubmission = mongoose.model('PlacementTestSubmission', placementTestSubmissionSchema);

module.exports = { PlacementTest, PlacementTestSubmission };
