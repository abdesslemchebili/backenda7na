const Notification = require('../models/Notification');
const User = require('../models/User');

// POST /api/notifications - create and send (admin)
const createNotification = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin only' });
    }
    const { title, body, type, recipients, broadcast, data } = req.body;
    let userIds = recipients || [];
    if (broadcast) {
      const users = await User.find({}).select('_id');
      userIds = users.map(u => u._id.toString());
    }
    if (!userIds.length) {
      return res.status(400).json({ error: 'BadRequest', message: 'recipients or broadcast required' });
    }
    const docs = userIds.map(rid => ({
      title: title || { en: '', fr: '', ar: '' },
      body: body || { en: '', fr: '', ar: '' },
      type: type || 'general',
      recipient: rid,
      data: data || {}
    }));
    await Notification.insertMany(docs);
    res.status(201).json({ message: 'Notification sent', count: docs.length });
  } catch (err) {
    console.error('createNotification:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/notifications or /api/notifications/me
const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true' || unreadOnly === true) filter.read = false;
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const limitNum = Math.min(100, parseInt(limit) || 20);
    const [data, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Notification.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: Math.max(1, parseInt(page)), limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error('getMyNotifications:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PATCH /api/notifications/:id/read
const markOneRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: 'NotFound', message: 'Notification not found' });
    res.json(notif);
  } catch (err) {
    console.error('markOneRead:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/notifications/mark-read (bulk)
const markReadBulk = async (req, res) => {
  try {
    const { ids, all } = req.body;
    const filter = { recipient: req.user._id };
    if (all) {
      await Notification.updateMany(filter, { read: true });
      const count = await Notification.countDocuments(filter);
      return res.json({ message: `Marked ${count} notifications as read` });
    }
    if (ids && Array.isArray(ids) && ids.length) {
      const result = await Notification.updateMany(
        { _id: { $in: ids }, recipient: req.user._id },
        { read: true }
      );
      return res.json({ message: `Marked ${result.modifiedCount} notifications as read` });
    }
    res.status(400).json({ error: 'BadRequest', message: 'ids array or all: true required' });
  } catch (err) {
    console.error('markReadBulk:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { createNotification, getMyNotifications, markOneRead, markReadBulk };
