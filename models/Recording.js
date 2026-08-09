const mongoose = require('mongoose');

const RECORDING_STATUSES = ['processing', 'ready', 'failed'];

const recordingSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Session (Class) is required'],
      unique: true,
    },
    storageUrl: {
      type: String,
      default: null,
    },
    externalUrl: {
      type: String,
      default: null,
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: null,
    },
    status: {
      type: String,
      enum: RECORDING_STATUSES,
      default: 'processing',
    },
    failureReason: {
      type: String,
      default: null,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

recordingSchema.index({ status: 1 });

module.exports = mongoose.model('Recording', recordingSchema);
module.exports.RECORDING_STATUSES = RECORDING_STATUSES;
