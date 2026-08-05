/** Niveaux CEFR allemand — école Nourhen Albouchi */
const GERMAN_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const GERMAN_SUB_LEVELS = [
  'A1.1', 'A1.2',
  'A2.1', 'A2.2',
  'B1.1', 'B1.2',
  'B2.1', 'B2.2',
  'C1.1', 'C1.2',
  'C2.1', 'C2.2'
];

const SUB_LEVEL_PROGRESSION = [
  'A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2', 'C2.1', 'C2.2'
];

const PAYMENT_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_SUBMITTED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED'
];

const ENROLLMENT_STATUSES = ['pending', 'contacted', 'approved', 'rejected'];

function getNextSubLevel(current) {
  const idx = SUB_LEVEL_PROGRESSION.indexOf(current);
  if (idx === -1 || idx >= SUB_LEVEL_PROGRESSION.length - 1) return null;
  return SUB_LEVEL_PROGRESSION[idx + 1];
}

function subLevelToMainLevel(subLevel) {
  if (!subLevel) return null;
  return subLevel.split('.')[0];
}

module.exports = {
  GERMAN_LEVELS,
  GERMAN_SUB_LEVELS,
  SUB_LEVEL_PROGRESSION,
  PAYMENT_STATUSES,
  ENROLLMENT_STATUSES,
  getNextSubLevel,
  subLevelToMainLevel
};
