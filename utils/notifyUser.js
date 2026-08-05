const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail } = require('./emailService');

/**
 * Crée une notification in-app et envoie un email si les préférences le permettent.
 */
async function notifyUser(userId, { title, body, type = 'general', data = {}, emailTemplate = null, emailData = {} }) {
  const user = await User.findById(userId).select('email firstName preferences');
  if (!user) return null;

  const notif = await Notification.create({
    title: typeof title === 'string' ? { en: title, fr: title, ar: title } : title,
    body: typeof body === 'string' ? { en: body, fr: body, ar: body } : body,
    type,
    recipient: userId,
    data
  });

  if (emailTemplate && user.preferences?.notifications?.email !== false) {
    try {
      const lang = user.preferences?.language || 'fr';
      await sendEmail(user.email, emailTemplate, lang, {
        firstName: user.firstName,
        ...emailData
      });
    } catch (err) {
      console.error('notifyUser email error:', err.message);
    }
  }

  return notif;
}

async function notifyAdmins({ title, body, type = 'general', data = {} }) {
  const admins = await User.find({ role: 'admin' }).select('_id');
  const docs = admins.map((admin) => ({
    title: typeof title === 'string' ? { en: title, fr: title, ar: title } : title,
    body: typeof body === 'string' ? { en: body, fr: body, ar: body } : body,
    type,
    recipient: admin._id,
    data
  }));
  if (docs.length) await Notification.insertMany(docs);
}

module.exports = { notifyUser, notifyAdmins };
