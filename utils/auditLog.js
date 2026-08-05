const AuditLog = require('../models/AuditLog');

async function writeAuditLog(req, { action, targetType, targetId, details = {} }) {
  try {
    await AuditLog.create({
      action,
      actor: req.user._id,
      targetType,
      targetId,
      details,
      ip: req.ip || req.headers['x-forwarded-for'] || null
    });
  } catch (err) {
    console.error('writeAuditLog:', err.message);
  }
}

module.exports = { writeAuditLog };
