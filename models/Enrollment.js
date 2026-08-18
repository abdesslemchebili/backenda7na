const mongoose = require('mongoose');

const ENROLLMENT_STATUSES = ['active', 'completed', 'withdrawn', 'pending'];

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    classGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      required: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ENROLLMENT_STATUSES,
      default: 'active',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

/** One active enrollment per student per class group */
enrollmentSchema.index(
  { student: 1, classGroup: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  }
);

enrollmentSchema.index({ classGroup: 1, status: 1 });
enrollmentSchema.index({ student: 1, status: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
module.exports.ENROLLMENT_STATUSES = ENROLLMENT_STATUSES;
