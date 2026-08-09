const mongoose = require('mongoose');
const { GAME_TYPES } = require('../constants/gamification');

const gameItemSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true },
    translation: { type: String, required: true, trim: true },
    hint: { type: String, default: '' },
  },
  { _id: true }
);

const learningGameSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, required: true },
      fr: { type: String, default: '' },
      ar: { type: String, default: '' },
    },
    type: {
      type: String,
      enum: GAME_TYPES,
      default: 'word_match',
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    items: {
      type: [gameItemSchema],
      validate: [(v) => v.length >= 2, 'At least 2 items required'],
    },
    order: { type: Number, default: 0 },
    xpReward: { type: Number, default: 10, min: 1 },
    active: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

const gamePlaySchema = new mongoose.Schema(
  {
    game: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningGame',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    xpEarned: { type: Number, default: 0 },
    pairsMatched: { type: Number, default: 0 },
    totalPairs: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

learningGameSchema.index({ book: 1, chapter: 1, order: 1 });
learningGameSchema.index({ chapter: 1, active: 1 });
gamePlaySchema.index({ student: 1, game: 1, createdAt: -1 });

const LearningGame = mongoose.model('LearningGame', learningGameSchema);
const GamePlay = mongoose.model('GamePlay', gamePlaySchema);

module.exports = { LearningGame, GamePlay };
