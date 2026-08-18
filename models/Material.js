const mongoose = require('mongoose');

const MATERIAL_TYPES = ['pdf', 'audio', 'video', 'link', 'document'];

const materialSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: MATERIAL_TYPES,
      required: [true, 'Material type is required'],
    },
    title: {
      en: { type: String, trim: true, maxlength: 200 },
      fr: { type: String, trim: true, maxlength: 200 },
      ar: { type: String, trim: true, maxlength: 200 },
    },
    fileUrl: { type: String, default: null },
    externalUrl: { type: String, default: null },
    language: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Language',
      default: null,
    },
    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Level',
      default: null,
    },
    classGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      default: null,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      default: null,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
      default: null,
    },
    duration: { type: Number, default: null },
    transcript: { type: String, default: null },
    order: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

materialSchema.index({ book: 1, chapter: 1, order: 1 });
materialSchema.index({ classGroup: 1, type: 1 });
materialSchema.index({ chapter: 1, active: 1 });

module.exports = mongoose.model('Material', materialSchema);
module.exports.MATERIAL_TYPES = MATERIAL_TYPES;
