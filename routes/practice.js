const express = require('express');
const router = express.Router();
const practiceCtrl = require('../controllers/practiceController');
const {
  authenticateToken,
  authorizeRoles,
  requireRegloForStudents,
} = require('../middleware/auth');

router.get(
  '/course/:courseId',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.getCoursePractice
);
router.post(
  '/course/:courseId/ensure',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.ensureCoursePractice
);
router.get(
  '/course/:courseId/leaderboard',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.getLeaderboard
);
router.get(
  '/course/:courseId/challenges',
  authenticateToken,
  requireRegloForStudents,
  practiceCtrl.listChallenges
);
router.post(
  '/course/:courseId/challenges',
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
