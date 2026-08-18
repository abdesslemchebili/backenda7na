const express = require('express');
const router = express.Router();
const practiceCtrl = require('../controllers/practiceController');
const {
  authenticateToken,
  authorizeRoles,
  requireRegloForStudents,
} = require('../middleware/auth');

router.get(
  '/group/:classGroupId',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.getGroupPractice
);
router.post(
  '/group/:classGroupId/ensure',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.ensureGroupPractice
);
router.get(
  '/group/:classGroupId/leaderboard',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.getLeaderboard
);
router.get(
  '/group/:classGroupId/challenges',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.listChallenges
);
router.post(
  '/group/:classGroupId/challenges',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  practiceCtrl.createChallenge
);

router.get('/packs/:id', authenticateToken, requireRegloForStudents, practiceCtrl.getPack);
router.post(
  '/packs/:id/submit',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.submitPack
);

router.post(
  '/challenges/:id/join',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.joinChallenge
);
router.post(
  '/challenges/:id/submit',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.submitChallenge
);

module.exports = router;
