const mongoose = require('mongoose');

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
    coverUrl: { type: String, default: null },
    pdfUrl: { type: String, default: null },
    pdfSize: { type: Number, default: 0 },
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
