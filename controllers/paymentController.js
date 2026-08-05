const Payment = require('../models/Payment');
const User = require('../models/User');
const { sendPaymentStatusUpdate } = require('../utils/emailService');
const { notifyUser, notifyAdmins } = require('../utils/notifyUser');
const { buildSignedFileUrl } = require('../utils/fileAccess');
const { enrollStudentFromAssignedClassGroup } = require('../utils/courseEnrollment');

function withSignedInvoiceUrl(payment, req) {
  const row = typeof payment.toObject === 'function' ? payment.toObject() : { ...payment };
  if (row.invoiceImageUrl) {
    try {
      row.invoiceImageUrl = buildSignedFileUrl(row.invoiceImageUrl, req.user._id, req);
    } catch (e) {
      /* keep stored path if signing fails */
    }
  }
  return row;
}

// POST /api/payments — student submits proof
const submitPayment = async (req, res) => {
  try {
    const { invoiceImageUrl, paymentDate, notes } = req.body;

    if (!invoiceImageUrl || !paymentDate) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'invoiceImageUrl and paymentDate are required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'student') {
      return res.status(403).json({ message: 'Students only' });
    }

    const payment = await Payment.create({
      student: req.user._id,
      invoiceImageUrl,
      paymentDate: new Date(paymentDate),
      notes: notes || '',
      status: 'PAYMENT_SUBMITTED'
    });

    user.paymentStatus = 'PAYMENT_SUBMITTED';
    await user.save();

    await notifyAdmins({
      title: { fr: 'Preuve de paiement soumise', en: 'Payment proof submitted' },
      body: { fr: `${user.firstName} ${user.lastName} a soumis une preuve de paiement.`, en: `${user.firstName} ${user.lastName} submitted payment proof.` },
      type: 'payment',
      data: { paymentId: payment._id, studentId: user._id }
    });

    res.status(201).json(payment);
  } catch (err) {
    console.error('submitPayment:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/payments/me — student
const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ data: payments.map((p) => withSignedInvoiceUrl(p, req)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/payments — admin
const listPayments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);

    const [data, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('student', 'firstName lastName email username')
        .populate('reviewedBy', 'firstName lastName')
        .lean(),
      Payment.countDocuments(filter)
    ]);

    res.json({
      data: data.map((p) => withSignedInvoiceUrl(p, req)),
      pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/payments/:id/review — admin
const reviewPayment = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'action must be approve or reject' });
    }

    const payment = await Payment.findById(req.params.id).populate('student');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const student = await User.findById(payment.student._id || payment.student);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();

    if (action === 'approve') {
      payment.status = 'PAYMENT_APPROVED';
      student.paymentStatus = 'PAYMENT_APPROVED';
      student.status = 'reglo';
      await enrollStudentFromAssignedClassGroup(student._id);
      await notifyUser(student._id, {
        title: { fr: 'Paiement approuvé', en: 'Payment approved' },
        body: { fr: 'Votre paiement a été validé. Vous avez maintenant accès aux contenus.', en: 'Your payment was approved. You now have full access.' },
        type: 'payment_approved',
        emailTemplate: 'paymentStatusUpdate',
        emailData: { newStatus: 'ACTIVE' }
      });
      try {
        await sendPaymentStatusUpdate(student, 'ACTIVE', student.preferences?.language || 'fr');
      } catch (e) { /* ignore */ }
    } else {
      payment.status = 'PAYMENT_REJECTED';
      payment.rejectionReason = rejectionReason || '';
      student.paymentStatus = 'PAYMENT_REJECTED';
      await notifyUser(student._id, {
        title: { fr: 'Paiement rejeté', en: 'Payment rejected' },
        body: { fr: rejectionReason || 'Votre preuve de paiement a été rejetée. Veuillez soumettre une nouvelle preuve.', en: rejectionReason || 'Your payment proof was rejected.' },
        type: 'payment_rejected',
        emailTemplate: 'paymentStatusUpdate',
        emailData: { newStatus: 'PAYMENT_REJECTED' }
      });
    }

    await payment.save();
    await student.save();

    res.json({ payment, student: { _id: student._id, status: student.status, paymentStatus: student.paymentStatus } });
  } catch (err) {
    console.error('reviewPayment:', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  submitPayment,
  getMyPayments,
  listPayments,
  reviewPayment
};
