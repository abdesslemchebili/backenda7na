const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: {
    en: { type: String, default: '' },
    fr: { type: String, default: '' },
    ar: { type: String, default: '' }
  },
  description: {
    en: { type: String, default: '' },
    fr: { type: String, default: '' },
    ar: { type: String, default: '' }
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  dueAt: { type: Date, required: true },
  maxScore: { type: Number, default: 100 },
  type: { type: String, enum: ['essay', 'quiz', 'file', 'other'], default: 'essay' },
  attachments: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

assignmentSchema.index({ course: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
