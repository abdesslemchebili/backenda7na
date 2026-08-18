const mongoose = require('mongoose');
const { GERMAN_LEVELS, GERMAN_SUB_LEVELS } = require('../constants/germanLevels');

const classGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      maxlength: [200, 'Name too long']
    },
    description: { type: String, trim: true },
    languageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Language',
      required: [true, 'Language is required'],
    },
    levelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Level',
      default: null,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      default: null,
    },
    level: {
      type: String,
      enum: GERMAN_LEVELS,
      default: null
    },
    subLevel: {
      type: String,
      enum: GERMAN_SUB_LEVELS,
      default: null
    },
    capacity: {
      type: Number,
      min: 1,
      default: 20
    },
    schedule: {
      days: [{ type: String }],
      time: { type: String, default: '' },
      timezone: { type: String, default: 'Africa/Tunis' }
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    }
  },
  { timestamps: true }
);

classGroupSchema.index({ professorId: 1 });
classGroupSchema.index({ languageId: 1, levelId: 1 });
classGroupSchema.index({ bookId: 1 });
classGroupSchema.index({ status: 1 });

module.exports = mongoose.model('ClassGroup', classGroupSchema);
