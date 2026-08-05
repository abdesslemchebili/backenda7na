const mongoose = require('mongoose');
const { GERMAN_LEVELS, ENROLLMENT_STATUSES } = require('../constants/germanLevels');

const enrollmentRequestSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    currentGermanLevel: {
      type: String,
      enum: [...GERMAN_LEVELS, 'none', 'unknown'],
      default: 'unknown'
    },
    education: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ENROLLMENT_STATUSES,
      default: 'pending'
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },
    adminNotes: { type: String, trim: true, default: '' },
    createdUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedClassGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      default: null
    },
    communications: [{
      message: String,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

enrollmentRequestSchema.index({ status: 1, createdAt: -1 });
enrollmentRequestSchema.index({ email: 1 });

module.exports = mongoose.model('EnrollmentRequest', enrollmentRequestSchema);
