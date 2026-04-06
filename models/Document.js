const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: {
    en: { type: String, default: '' },
    fr: { type: String, default: '' },
    ar: { type: String, default: '' }
  },
  url: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'other'],
    default: 'other'
  },
  size: {
    type: Number,
    default: 0
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

documentSchema.index({ course: 1 });

module.exports = mongoose.model('Document', documentSchema);
