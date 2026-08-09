const mongoose = require('mongoose');
const { CEFR_LEVELS } = require('../constants/cefrLevels');

const levelSchema = new mongoose.Schema(
  {
    language: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Language',
      required: [true, 'Language is required'],
    },
    code: {
      type: String,
      enum: CEFR_LEVELS,
      required: [true, 'CEFR code is required'],
    },
    name: {
      en: { type: String, trim: true },
      fr: { type: String, trim: true },
      ar: { type: String, trim: true },
    },
    description: {
      en: { type: String, maxlength: 500 },
      fr: { type: String, maxlength: 500 },
      ar: { type: String, maxlength: 500 },
    },
    order: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

levelSchema.index({ language: 1, code: 1 }, { unique: true });
levelSchema.index({ language: 1, active: 1, order: 1 });

module.exports = mongoose.model('Level', levelSchema);
