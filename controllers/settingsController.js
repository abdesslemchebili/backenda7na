const Settings = require('../models/Settings');
const User = require('../models/User');
const Notification = require('../models/Notification');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    let doc = await Settings.findOne();
    if (!doc) {
      doc = await Settings.create({});
    }
    res.json({
      email: doc.email || { smtpHost: '', smtpPort: 587, fromAddress: '', secure: true },
      platform: doc.platform || { timezone: 'Africa/Casablanca', maintenanceMode: false, featureFlags: {} }
    });
  } catch (err) {
    console.error('getSettings:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/settings
const updateSettings = async (req, res) => {
  try {
    let doc = await Settings.findOne();
    if (!doc) doc = new Settings({});
    const { email, platform } = req.body;
    if (email) doc.email = { ...doc.email, ...email };
    if (platform) doc.platform = { ...doc.platform, ...platform };
    await doc.save();
    res.json({
      email: doc.email,
      platform: doc.platform
    });
  } catch (err) {
    console.error('updateSettings:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/settings/announcement
const sendAnnouncement = async (req, res) => {
  try {
    const { title, body, targetRoles, targetUserIds } = req.body;
    let userIds = targetUserIds && targetUserIds.length ? targetUserIds : [];
    if (targetRoles && targetRoles.length) {
      const users = await User.find({ role: { $in: targetRoles } }).select('_id');
      userIds = [...new Set([...userIds, ...users.map(u => u._id.toString())])];
    }
    if (!userIds.length) {
      const users = await User.find({}).select('_id');
      userIds = users.map(u => u._id.toString());
    }
    const docs = userIds.map(rid => ({
      title: title || { en: '', fr: '', ar: '' },
      body: body || { en: '', fr: '', ar: '' },
      type: 'announcement',
      recipient: rid,
      data: {}
    }));
    await Notification.insertMany(docs);
    res.json({ message: 'Announcement sent', count: docs.length });
  } catch (err) {
    console.error('sendAnnouncement:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { getSettings, updateSettings, sendAnnouncement };
