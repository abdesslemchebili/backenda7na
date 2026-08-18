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
  classGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassGroup',
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

documentSchema.index({ classGroup: 1 });

module.exports = mongoose.model('Document', documentSchema);
