const mongoose = require('mongoose');
const { GERMAN_SUB_LEVELS } = require('../constants/germanLevels');

const PRACTICE_KINDS = ['quiz', 'word_match', 'flashcard'];

const questionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['multiple_choice'], default: 'multiple_choice' },
    question: {
      en: { type: String, default: '' },
      fr: { type: String, default: '' },
      ar: { type: String, default: '' },
    },
    options: [{ type: String }],
    correctAnswer: { type: String, default: '' },
    points: { type: Number, default: 1, min: 0 },
  },
  { _id: true }
);

const itemSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true },
    translation: { type: String, required: true, trim: true },
    hint: { type: String, default: '' },
  },
  { _id: true }
);

const practicePackSchema = new mongoose.Schema(
  {
    languageCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    subLevel: {
      type: String,
      required: true,
      enum: GERMAN_SUB_LEVELS,
    },
    kind: {
      type: String,
      enum: PRACTICE_KINDS,
      required: true,
    },
    packKey: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      en: { type: String, default: '' },
      fr: { type: String, default: '' },
      ar: { type: String, default: '' },
    },
    questions: [questionSchema],
    items: [itemSchema],
    source: {
      type: String,
      enum: ['ai', 'fallback'],
      default: 'ai',
    },
    promptVersion: { type: String, default: 'v1' },
    generatedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    xpReward: { type: Number, default: 15, min: 1 },
  },
  { timestamps: true }
);

practicePackSchema.index(
  { languageCode: 1, subLevel: 1, kind: 1, packKey: 1 },
  { unique: true }
);
practicePackSchema.index({ languageCode: 1, subLevel: 1, kind: 1, active: 1, generatedAt: -1 });

module.exports = mongoose.model('PracticePack', practicePackSchema);
module.exports.PRACTICE_KINDS = PRACTICE_KINDS;
