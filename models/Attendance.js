const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  joinedAt: Date,
  leftAt: Date
}, {
  timestamps: true
});

attendanceSchema.index({ class: 1, student: 1 });
attendanceSchema.index({ student: 1 });
attendanceSchema.index({ class: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
