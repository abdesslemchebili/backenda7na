const mongoose = require('mongoose');

/**
 * Catalogue book (e.g. Menschen A1).
 * Store PDF via object storage / uploads — not the binary in MongoDB.
 * Commercial textbooks may be referenced only when Nour Academy holds the required license.
 */

const bookSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, trim: true, maxlength: 200 },
      fr: { type: String, trim: true, maxlength: 200 },
      ar: { type: String, trim: true, maxlength: 200 },
    },
    author: { type: String, trim: true, maxlength: 200 },
    publisher: { type: String, trim: true, maxlength: 200 },
    language: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Language',
      required: [true, 'Language is required'],
    },
    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Level',
      default: null,
    },
    isbn: { type: String, trim: true, maxlength: 32, default: '' },
    coverUrl: { type: String, default: null },
    // Storage key or local path — never the raw PDF binary.
    // Commercial textbooks (e.g. Menschen) require a valid license/rights.
    pdfUrl: { type: String, default: null },
    pdfSize: { type: Number, default: 0 },
    pdfMimeType: { type: String, default: 'application/pdf' },
    pageCount: { type: Number, min: 0, default: 0 },
    publicResource: { type: Boolean, default: false },
    description: {
      en: { type: String, maxlength: 2000 },
      fr: { type: String, maxlength: 2000 },
      ar: { type: String, maxlength: 2000 },
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    active: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

bookSchema.index({ language: 1, level: 1, status: 1 });
bookSchema.index({ active: 1, status: 1 });

module.exports = mongoose.model('Book', bookSchema);
