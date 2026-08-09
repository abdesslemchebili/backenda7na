const User = require('../models/User');
const { BADGE_DEFINITIONS, XP_REWARDS } = require('../constants/gamification');

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ensureGamification(user) {
  if (!user.studentInfo) user.studentInfo = {};
  if (!user.studentInfo.gamification) {
    user.studentInfo.gamification = {
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      badges: [],
      gamesPlayed: 0,
      exercisesCompleted: 0,
    };
  }
  return user.studentInfo.gamification;
}

function hasBadge(gam, code) {
  return (gam.badges || []).some((b) => b.code === code);
}

function awardBadge(gam, code) {
  if (hasBadge(gam, code)) return null;
  const def = BADGE_DEFINITIONS[code];
  if (!def) return null;
  gam.badges.push({ code, earnedAt: new Date() });
  return { code, label: def.label };
}

function evaluateBadges(gam) {
  const earned = [];
  if (gam.gamesPlayed >= 1) {
    const b = awardBadge(gam, 'first_game');
    if (b) earned.push(b);
  }
  if (gam.exercisesCompleted >= 1) {
    const b = awardBadge(gam, 'first_exercise');
    if (b) earned.push(b);
  }
  if (gam.currentStreak >= 3) {
    const b = awardBadge(gam, 'streak_3');
    if (b) earned.push(b);
  }
  if (gam.currentStreak >= 7) {
    const b = awardBadge(gam, 'streak_7');
    if (b) earned.push(b);
  }
  if (gam.totalXp >= 100) {
    const b = awardBadge(gam, 'xp_100');
    if (b) earned.push(b);
  }
  if (gam.totalXp >= 500) {
    const b = awardBadge(gam, 'xp_500');
    if (b) earned.push(b);
  }
  return earned;
}

function updateStreak(gam, now = new Date()) {
  const today = startOfDay(now);
  const last = gam.lastActivityDate ? startOfDay(new Date(gam.lastActivityDate)) : null;

  if (!last) {
    gam.currentStreak = 1;
  } else {
    const diffDays = Math.round((today - last) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      // same day — keep streak
    } else if (diffDays === 1) {
      gam.currentStreak = (gam.currentStreak || 0) + 1;
    } else {
      gam.currentStreak = 1;
    }
  }

  gam.lastActivityDate = now;
  if (gam.currentStreak > (gam.longestStreak || 0)) {
    gam.longestStreak = gam.currentStreak;
  }
}

async function awardGamification(userId, { xp = 0, incrementGames = 0, incrementExercises = 0 } = {}) {
  const user = await User.findById(userId);
  if (!user || user.role !== 'student') return null;

  const gam = ensureGamification(user);
  updateStreak(gam);

  if (xp > 0) gam.totalXp = (gam.totalXp || 0) + xp;
  if (incrementGames) gam.gamesPlayed = (gam.gamesPlayed || 0) + incrementGames;
  if (incrementExercises) gam.exercisesCompleted = (gam.exercisesCompleted || 0) + incrementExercises;

  const newBadges = evaluateBadges(gam);
  user.markModified('studentInfo');
  await user.save();

  return {
    totalXp: gam.totalXp,
    currentStreak: gam.currentStreak,
    longestStreak: gam.longestStreak,
    xpEarned: xp,
    newBadges,
  };
}

function formatGamificationProfile(user) {
  const gam = user.studentInfo?.gamification || {};
  const badges = (gam.badges || []).map((b) => {
    const def = BADGE_DEFINITIONS[b.code] || {};
    return {
      code: b.code,
      label: def.label || { fr: b.code, en: b.code },
      description: def.description,
      earnedAt: b.earnedAt,
    };
  });

  return {
    totalXp: gam.totalXp || 0,
    currentStreak: gam.currentStreak || 0,
    longestStreak: gam.longestStreak || 0,
    lastActivityDate: gam.lastActivityDate,
    gamesPlayed: gam.gamesPlayed || 0,
    exercisesCompleted: gam.exercisesCompleted || 0,
    badges,
  };
}

module.exports = {
  XP_REWARDS,
  BADGE_DEFINITIONS,
  ensureGamification,
  awardGamification,
  formatGamificationProfile,
  updateStreak,
  evaluateBadges,
};
