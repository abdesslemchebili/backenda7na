const BADGE_DEFINITIONS = {
  first_game: {
    label: { fr: 'Premier jeu', en: 'First game' },
    description: { fr: 'Compléter votre premier jeu', en: 'Complete your first game' },
  },
  first_exercise: {
    label: { fr: 'Premier quiz', en: 'First quiz' },
    description: { fr: 'Terminer votre premier exercice', en: 'Complete your first exercise' },
  },
  streak_3: {
    label: { fr: 'Série de 3 jours', en: '3-day streak' },
    description: { fr: 'Pratiquer 3 jours consécutifs', en: 'Practice 3 days in a row' },
    streakRequired: 3,
  },
  streak_7: {
    label: { fr: 'Série de 7 jours', en: '7-day streak' },
    description: { fr: 'Pratiquer 7 jours consécutifs', en: 'Practice 7 days in a row' },
    streakRequired: 7,
  },
  xp_100: {
    label: { fr: '100 XP', en: '100 XP' },
    description: { fr: 'Atteindre 100 points d\'expérience', en: 'Reach 100 XP' },
    xpRequired: 100,
  },
  xp_500: {
    label: { fr: '500 XP', en: '500 XP' },
    description: { fr: 'Atteindre 500 points d\'expérience', en: 'Reach 500 XP' },
    xpRequired: 500,
  },
};

const XP_REWARDS = {
  game_complete: 10,
  exercise_pass: 15,
  exercise_perfect: 25,
  attendance_session: 5,
};

const GAME_TYPES = ['word_match', 'flashcard'];

module.exports = { BADGE_DEFINITIONS, XP_REWARDS, GAME_TYPES };
