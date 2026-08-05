const EnrollmentRequest = require('../models/EnrollmentRequest');
const User = require('../models/User');
const ClassGroup = require('../models/ClassGroup');
const { generateTempPassword, sendStudentWelcome } = require('../utils/emailService');
const { notifyUser, notifyAdmins } = require('../utils/notifyUser');
const { subLevelToMainLevel } = require('../constants/germanLevels');
const { enrollStudentInCourseFromClassGroup } = require('../utils/courseEnrollment');

function splitFullName(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function generateUsername(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
  return base || `student${Date.now()}`;
}

// POST /api/enrollment-requests — public
const createEnrollmentRequest = async (req, res) => {
  try {
    const { fullName, email, phone, country, currentGermanLevel, education, notes } = req.body;

    if (!fullName || !email || !phone || !country) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'fullName, email, phone, and country are required'
      });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'An account with this email already exists'
      });
    }

    const pending = await EnrollmentRequest.findOne({ email: email.toLowerCase(), status: 'pending' });
    if (pending) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'A pending enrollment request already exists for this email'
      });
    }

    const request = await EnrollmentRequest.create({
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      country: String(country).trim(),
      currentGermanLevel: currentGermanLevel || 'unknown',
      education: education ? String(education).trim() : '',
      notes: notes ? String(notes).trim() : ''
    });

    await notifyAdmins({
      title: { fr: 'Nouvelle demande d\'inscription', en: 'New enrollment request' },
      body: { fr: `${request.fullName} a soumis une demande d'inscription.`, en: `${request.fullName} submitted an enrollment request.` },
      type: 'enrollment',
      data: { enrollmentRequestId: request._id }
    });

    res.status(201).json({ ok: true, id: request._id });
  } catch (err) {
    console.error('createEnrollmentRequest:', err);
    res.status(500).json({ message: err.message || 'Failed to save enrollment request' });
  }
};

// GET /api/enrollment-requests — admin
const listEnrollmentRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);

    const [data, total] = await Promise.all([
      EnrollmentRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('reviewedBy', 'firstName lastName email')
        .populate('createdUserId', 'firstName lastName email')
        .populate('assignedClassGroupId', 'name subLevel')
        .lean(),
      EnrollmentRequest.countDocuments(filter)
    ]);

    res.json({ data, pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error('listEnrollmentRequests:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/enrollment-requests/:id — admin
const getEnrollmentRequest = async (req, res) => {
  try {
    const request = await EnrollmentRequest.findById(req.params.id)
      .populate('reviewedBy', 'firstName lastName email')
      .populate('createdUserId', 'firstName lastName email username')
      .populate('assignedClassGroupId', 'name subLevel level');
    if (!request) return res.status(404).json({ message: 'Enrollment request not found' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/enrollment-requests/:id/status — admin
const updateEnrollmentStatus = async (req, res) => {
  try {
    const { status, rejectionReason, adminNotes } = req.body;
    const valid = ['contacted', 'rejected'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: 'status must be contacted or rejected' });
    }

    const request = await EnrollmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Enrollment request not found' });
    if (request.status === 'approved') {
      return res.status(400).json({ message: 'Cannot change status of approved request' });
    }

    request.status = status;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    if (rejectionReason) request.rejectionReason = rejectionReason;
    if (adminNotes) request.adminNotes = adminNotes;
    await request.save();

    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/enrollment-requests/:id/approve — admin
const approveEnrollmentRequest = async (req, res) => {
  try {
    const { classGroupId } = req.body;
    const request = await EnrollmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Enrollment request not found' });
    if (request.status === 'approved') {
      return res.status(400).json({ message: 'Request already approved' });
    }

    const existingUser = await User.findByEmail(request.email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const { firstName, lastName } = splitFullName(request.fullName);
    let username = generateUsername(request.email);
    const usernameTaken = await User.findOne({ username });
    if (usernameTaken) username = `${username}${Math.floor(Math.random() * 1000)}`;

    const tempPassword = generateTempPassword();

    const user = await User.create({
      firstName,
      lastName,
      email: request.email,
      username,
      phone: request.phone,
      country: request.country,
      password: tempPassword,
      role: 'student',
      status: 'verified',
      emailVerified: true,
      mustChangePassword: true,
      paymentStatus: 'PENDING_PAYMENT',
      studentInfo: {
        education: request.education,
        placementTestCompleted: false,
        germanSubLevel: null,
        placementLevel: request.currentGermanLevel !== 'unknown' && request.currentGermanLevel !== 'none'
          ? request.currentGermanLevel
          : null
      }
    });

    if (classGroupId) {
      const group = await ClassGroup.findById(classGroupId);
      if (group) {
        if (!group.studentIds.includes(user._id)) {
          group.studentIds.push(user._id);
          await group.save();
        }
        user.studentInfo.classGroupId = group._id;
        if (group.subLevel) user.studentInfo.germanSubLevel = group.subLevel;
        if (group.level) user.studentInfo.placementLevel = group.level;
        await user.save();
        request.assignedClassGroupId = group._id;

        await enrollStudentInCourseFromClassGroup(user._id, group);
      }
    }

    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.createdUserId = user._id;
    await request.save();

    try {
      await sendStudentWelcome(user, tempPassword, 'fr');
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr.message);
    }

    await notifyUser(user._id, {
      title: { fr: 'Compte créé', en: 'Account created' },
      body: { fr: 'Votre compte étudiant a été créé. Connectez-vous et changez votre mot de passe.', en: 'Your student account was created. Please login and change your password.' },
      type: 'account_creation'
    });

    res.json({
      message: 'Enrollment approved and student account created',
      user: { _id: user._id, email: user.email, username: user.username },
      enrollmentRequest: request
    });
  } catch (err) {
    console.error('approveEnrollmentRequest:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/enrollment-requests/:id/contact — admin
const contactEnrollmentRequest = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'message is required' });

    const request = await EnrollmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Enrollment request not found' });

    request.communications.push({ message, sentBy: req.user._id });
    if (request.status === 'pending') request.status = 'contacted';
    await request.save();

    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createEnrollmentRequest,
  listEnrollmentRequests,
  getEnrollmentRequest,
  updateEnrollmentStatus,
  approveEnrollmentRequest,
  contactEnrollmentRequest
};
