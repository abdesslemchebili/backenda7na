const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    programSlug: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ email: 1 });

module.exports = mongoose.model('Lead', leadSchema);
