const mongoose = require('mongoose');

/**
 * Student/professor bookmark on a book page.
 * Isolated per user — never shared across accounts.
 */
const bookBookmarkSchema = new mongoose.Schema(
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
    pageNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
  },
  { timestamps: true }
);

bookBookmarkSchema.index({ user: 1, book: 1, pageNumber: 1 }, { unique: true });
bookBookmarkSchema.index({ user: 1, book: 1, createdAt: -1 });

module.exports = mongoose.model('BookBookmark', bookBookmarkSchema);
