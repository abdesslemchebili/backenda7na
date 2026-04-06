const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  email: {
    smtpHost: String,
    smtpPort: Number,
    fromAddress: String,
    secure: Boolean
  },
  platform: {
    timezone: { type: String, default: 'Africa/Casablanca' },
    maintenanceMode: { type: Boolean, default: false },
    featureFlags: { type: mongoose.Schema.Types.Mixed, default: {} }
  }
}, { timestamps: true });

// Single document for platform settings
const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
