/** Niveaux CEFR standard (A1–C2) — réutilisable pour toutes les langues */
const { GERMAN_LEVELS } = require('./germanLevels');

const CEFR_LEVELS = GERMAN_LEVELS;

const CEFR_LEVEL_LABELS = {
  A1: { en: 'Beginner A1', fr: 'Débutant A1', ar: 'مبتدئ A1' },
  A2: { en: 'Elementary A2', fr: 'Élémentaire A2', ar: 'أساسي A2' },
  B1: { en: 'Intermediate B1', fr: 'Intermédiaire B1', ar: 'متوسط B1' },
  B2: { en: 'Upper Intermediate B2', fr: 'Intermédiaire supérieur B2', ar: 'فوق المتوسط B2' },
  C1: { en: 'Advanced C1', fr: 'Avancé C1', ar: 'متقدم C1' },
  C2: { en: 'Proficiency C2', fr: 'Maîtrise C2', ar: 'إتقان C2' },
};

const CEFR_LEVEL_ORDER = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

/** Map legacy Course.level → CEFR approximatif */
const LEGACY_LEVEL_TO_CEFR = {
  beginner: 'A1',
  intermediate: 'B1',
  advanced: 'C1',
};

module.exports = {
  CEFR_LEVELS,
  CEFR_LEVEL_LABELS,
  CEFR_LEVEL_ORDER,
  LEGACY_LEVEL_TO_CEFR,
};
