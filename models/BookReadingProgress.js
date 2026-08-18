const mongoose = require('mongoose');

/**
 * Per-user reading position for a catalogue book.
 * Independent from course/chapter completion (Enrollment / ChapterProgress).
 */
const bookReadingProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    lastPage: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    highestPage: {
      type: Number,
      min: 1,
      default: 1,
    },
    totalPages: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

bookReadingProgressSchema.index({ user: 1, book: 1 }, { unique: true });

module.exports = mongoose.model('BookReadingProgress', bookReadingProgressSchema);
