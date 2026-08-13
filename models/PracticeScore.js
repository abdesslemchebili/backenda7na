const mongoose = require('mongoose');

const practiceScoreSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    packId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PracticePack',
      required: true,
    },
    kind: {
      type: String,
      enum: ['quiz', 'word_match', 'flashcard'],
      required: true,
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    xpEarned: { type: Number, default: 0, min: 0 },
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroupChallenge',
      default: null,
    },
  },
  { timestamps: true }
);

practiceScoreSchema.index({ courseId: 1, studentId: 1, createdAt: -1 });
practiceScoreSchema.index({ courseId: 1, score: -1 });

module.exports = mongoose.model('PracticeScore', practiceScoreSchema);
