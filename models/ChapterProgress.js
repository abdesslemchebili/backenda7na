const mongoose = require('mongoose');

const CHAPTER_PROGRESS_STATUSES = ['locked', 'available', 'in_progress', 'completed'];

const chapterProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    classGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      required: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      default: null,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      required: true,
    },
    status: {
      type: String,
      enum: CHAPTER_PROGRESS_STATUSES,
      default: 'locked',
    },
    exercisesPassed: { type: Number, default: 0 },
    gamesCompleted: { type: Number, default: 0 },
    sessionsCompleted: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chapterProgressSchema.index({ student: 1, classGroup: 1, chapter: 1 }, { unique: true });
chapterProgressSchema.index({ classGroup: 1, student: 1 });
chapterProgressSchema.index({ classGroup: 1, status: 1 });

module.exports = mongoose.model('ChapterProgress', chapterProgressSchema);
module.exports.CHAPTER_PROGRESS_STATUSES = CHAPTER_PROGRESS_STATUSES;
