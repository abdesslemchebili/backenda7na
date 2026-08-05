const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: String,
  fileUrl: String,
  comment: String,
  attemptCount: { type: Number, default: 1 },
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'graded'],
    default: 'submitted'
  },
  score: Number,
  maxScore: Number,
  feedback: String,
  gradedAt: Date,
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1 });
submissionSchema.index({ student: 1 });

module.exports = mongoose.model('AssignmentSubmission', submissionSchema);
