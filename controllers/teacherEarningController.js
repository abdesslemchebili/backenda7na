const TeacherEarning = require('../models/TeacherEarning');
const User = require('../models/User');

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreateMonthlyEarning(professorId, month) {
  let earning = await TeacherEarning.findOne({ professorId, month });
  if (!earning) {
    const professor = await User.findById(professorId).select('professorInfo.hourlyRate');
    const rate = professor?.professorInfo?.hourlyRate || 0;
    earning = await TeacherEarning.create({
      professorId,
      month,
      hourlyRate: rate,
      workedHours: 0,
      balance: 0,
      sessions: []
    });
  }
  return earning;
}

// GET /api/teacher-earnings/me — professor
const getMyEarnings = async (req, res) => {
  try {
    const month = req.query.month || currentMonth();
    const earning = await getOrCreateMonthlyEarning(req.user._id, month);
    const history = await TeacherEarning.find({ professorId: req.user._id })
      .sort({ month: -1 })
      .limit(24)
      .lean();

    const totalEarnings = history.reduce((sum, e) => sum + (e.balance || 0), 0);

    res.json({ current: earning, history, totalEarnings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/teacher-earnings/:professorId/sessions — admin
const addSessionHours = async (req, res) => {
  try {
    const { classId, classTitle, hours, date, notes, month } = req.body;
    if (!hours || !date) {
      return res.status(400).json({ message: 'hours and date are required' });
    }

    const professor = await User.findById(req.params.professorId);
    if (!professor || professor.role !== 'professor') {
      return res.status(404).json({ message: 'Professor not found' });
    }

    const targetMonth = month || currentMonth();
    const earning = await getOrCreateMonthlyEarning(professor._id, targetMonth);

    earning.sessions.push({ classId, classTitle, hours, date: new Date(date), notes: notes || '' });
    earning.workedHours = (earning.workedHours || 0) + Number(hours);
    earning.balance = earning.workedHours * earning.hourlyRate;
    await earning.save();

    res.json(earning);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/teacher-earnings/:professorId/rate — admin
const setHourlyRate = async (req, res) => {
  try {
    const { hourlyRate } = req.body;
    const professor = await User.findById(req.params.professorId);
    if (!professor || professor.role !== 'professor') {
      return res.status(404).json({ message: 'Professor not found' });
    }

    professor.professorInfo = professor.professorInfo || {};
    professor.professorInfo.hourlyRate = hourlyRate;
    await professor.save();

    const earning = await getOrCreateMonthlyEarning(professor._id, currentMonth());
    earning.hourlyRate = hourlyRate;
    earning.balance = earning.workedHours * hourlyRate;
    await earning.save();

    res.json({ professor: { _id: professor._id, hourlyRate }, earning });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/teacher-earnings/close-month — admin cron/manual
const closeMonth = async (req, res) => {
  try {
    const { month } = req.body;
    const targetMonth = month || currentMonth();
    const result = await TeacherEarning.updateMany(
      { month: targetMonth, isClosed: false },
      { isClosed: true }
    );
    res.json({ message: `Closed ${result.modifiedCount} earning records for ${targetMonth}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teacher-earnings/:professorId — admin
const getProfessorEarnings = async (req, res) => {
  try {
    const professor = await User.findById(req.params.professorId).select(
      'firstName lastName email role professorInfo.hourlyRate',
    );
    if (!professor || professor.role !== 'professor') {
      return res.status(404).json({ message: 'Professor not found' });
    }

    const month = req.query.month || currentMonth();
    const earning = await getOrCreateMonthlyEarning(professor._id, month);
    const history = await TeacherEarning.find({ professorId: professor._id })
      .sort({ month: -1 })
      .limit(24)
      .lean();
    const totalEarnings = history.reduce((sum, e) => sum + (e.balance || 0), 0);

    res.json({
      professor: {
        _id: professor._id,
        firstName: professor.firstName,
        lastName: professor.lastName,
        email: professor.email,
        hourlyRate: professor.professorInfo?.hourlyRate || 0,
      },
      current: earning,
      history,
      totalEarnings,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teacher-earnings — admin list all
const listAllEarnings = async (req, res) => {
  try {
    const { month, professorId } = req.query;
    const filter = {};
    if (month) filter.month = month;
    if (professorId) filter.professorId = professorId;

    const data = await TeacherEarning.find(filter)
      .populate('professorId', 'firstName lastName email')
      .sort({ month: -1 });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getMyEarnings,
  getProfessorEarnings,
  addSessionHours,
  setHourlyRate,
  closeMonth,
  listAllEarnings
};
