const User = require('../models/User');
const { BADGE_DEFINITIONS } = require('../constants/gamification');
const { formatGamificationProfile } = require('../utils/gamificationHelper');

// GET /api/gamification/me
const getMyProfile = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }
    const user = await User.findById(req.user._id).select('studentInfo.gamification');
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    res.json(formatGamificationProfile(user));
  } catch (err) {
    console.error('getMyProfile:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/gamification/badges
const listBadges = async (req, res) => {
  try {
    const badges = Object.entries(BADGE_DEFINITIONS).map(([code, def]) => ({
      code,
      label: def.label,
      description: def.description,
      xpRequired: def.xpRequired,
      streakRequired: def.streakRequired,
    }));
    res.json({ data: badges });
  } catch (err) {
    console.error('listBadges:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { getMyProfile, listBadges };
