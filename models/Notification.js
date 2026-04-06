const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    en: { type: String, default: '' },
    fr: { type: String, default: '' },
    ar: { type: String, default: '' }
  },
  body: {
    en: { type: String, default: '' },
    fr: { type: String, default: '' },
    ar: { type: String, default: '' }
  },
  type: { type: String, default: 'general' },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  read: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
