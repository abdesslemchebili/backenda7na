const mongoose = require('mongoose');

const classGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      maxlength: [200, 'Name too long']
    },
    description: { type: String, trim: true },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null
    },
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    }
  },
  { timestamps: true }
);

classGroupSchema.index({ professorId: 1 });
classGroupSchema.index({ courseId: 1 });

module.exports = mongoose.model('ClassGroup', classGroupSchema);
