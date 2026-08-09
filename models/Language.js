const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Language name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
    },
    code: {
      type: String,
      required: [true, 'Language code is required'],
      trim: true,
      lowercase: true,
      maxlength: [10, 'Code too long'],
    },
    nativeName: {
      type: String,
      trim: true,
      maxlength: [100, 'Native name too long'],
    },
    icon: {
      type: String,
      trim: true,
      maxlength: [20, 'Icon too long'],
    },
    active: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

languageSchema.index({ code: 1 }, { unique: true });
languageSchema.index({ active: 1, order: 1 });

module.exports = mongoose.model('Language', languageSchema);
