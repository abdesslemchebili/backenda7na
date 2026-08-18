const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const groupChallengeSchema = new mongoose.Schema(
  {
    classGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      required: true,
    },
    packId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PracticePack',
      required: true,
    },
    title: { type: String, default: 'Défi de cohorte' },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    participants: [participantSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

groupChallengeSchema.index({ classGroupId: 1, status: 1, startsAt: -1 });

module.exports = mongoose.model('GroupChallenge', groupChallengeSchema);
