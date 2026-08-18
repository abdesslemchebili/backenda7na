const mongoose = require('mongoose');

const localizedTitle = {
  en: { type: String, trim: true, maxlength: 200 },
  fr: { type: String, trim: true, maxlength: 200 },
  ar: { type: String, trim: true, maxlength: 200 },
};

const sectionSchema = new mongoose.Schema(
  {
    title: localizedTitle,
    order: { type: Number, required: true, min: 1 },
    pageStart: { type: Number, min: 0, default: null },
    pageEnd: { type: Number, min: 0, default: null },
  },
  { _id: true }
);

const chapterSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: [true, 'Book is required'],
    },
    title: localizedTitle,
    order: {
      type: Number,
      required: [true, 'Chapter order is required'],
      min: 1,
    },
    description: {
      en: { type: String, maxlength: 2000 },
      fr: { type: String, maxlength: 2000 },
      ar: { type: String, maxlength: 2000 },
    },
    pageStart: { type: Number, min: 0, default: null },
    pageEnd: { type: Number, min: 0, default: null },
    sections: { type: [sectionSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

chapterSchema.index({ book: 1, order: 1 }, { unique: true });
chapterSchema.index({ book: 1, status: 1 });

module.exports = mongoose.model('Chapter', chapterSchema);
