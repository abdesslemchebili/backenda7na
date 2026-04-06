const Lead = require('../models/Lead');

// POST /api/leads — public
const createLead = async (req, res) => {
  try {
    const { programSlug, fullName, email, phone, message } = req.body;

    if (!programSlug || !fullName || !email || !phone) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'programSlug, fullName, email, and phone are required'
      });
    }

    await Lead.create({
      programSlug: String(programSlug).trim(),
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      message: message != null ? String(message).trim() : ''
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('createLead:', err);
    res.status(500).json({ message: err.message || 'Failed to save lead' });
  }
};

module.exports = { createLead };
