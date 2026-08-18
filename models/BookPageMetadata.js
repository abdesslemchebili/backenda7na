const mongoose = require('mongoose');

/**
 * Sparse educational metadata for a PDF page.
 * Do NOT create a row per PDF page — only when content is attached
 * (vocabulary, audio, exercises, games, teacher notes).
 *
 * References existing Material / Exercise / LearningGame documents
 * rather than duplicating their payloads.
 */
const vocabularyItemSchema = new mongoose.Schema(
  {
    term: { type: String, trim: true, maxlength: 200, required: true },
    translation: { type: String, trim: true, maxlength: 400, default: '' },
    audioUrl: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const teacherNoteSchema = new mongoose.Schema(
  {
    classGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, trim: true, maxlength: 4000, required: true },
  },
  { timestamps: true }
);

const bookPageMetadataSchema = new mongoose.Schema(
  {
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
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      default: null,
    },
    vocabulary: { type: [vocabularyItemSchema], default: [] },
    audioReferences: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    ],
    exerciseReferences: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise' },
    ],
    gameReferences: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'LearningGame' },
    ],
    videoReferences: [
      {
        title: { type: String, trim: true, maxlength: 200, default: '' },
        url: { type: String, trim: true, maxlength: 2000, default: '' },
      },
    ],
    teacherNotes: { type: [teacherNoteSchema], default: [] },
  },
  { timestamps: true }
);

bookPageMetadataSchema.index({ book: 1, pageNumber: 1 }, { unique: true });
bookPageMetadataSchema.index({ book: 1, chapter: 1 });

module.exports = mongoose.model('BookPageMetadata', bookPageMetadataSchema);
