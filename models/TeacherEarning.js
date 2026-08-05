const mongoose = require('mongoose');

const sessionEntrySchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  classTitle: { type: String, default: '' },
  hours: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  notes: { type: String, default: '' }
}, { _id: true });

const teacherEarningSchema = new mongoose.Schema(
  {
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    month: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'Month must be YYYY-MM format']
    },
    hourlyRate: { type: Number, required: true, min: 0 },
    workedHours: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    sessions: [sessionEntrySchema],
    isClosed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

teacherEarningSchema.index({ professorId: 1, month: 1 }, { unique: true });
teacherEarningSchema.index({ month: 1 });

module.exports = mongoose.model('TeacherEarning', teacherEarningSchema);
