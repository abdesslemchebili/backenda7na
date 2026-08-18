const express = require('express');
const router = express.Router();
const progressCtrl = require('../controllers/progressController');
const { authenticateToken, requireRegloForStudents } = require('../middleware/auth');

router.get(
  '/group/:classGroupId/leaderboard',
  authenticateToken,
  requireRegloForStudents,
  progressCtrl.getLeaderboard
);
router.get(
  '/group/:classGroupId/chapters',
  authenticateToken,
  requireRegloForStudents,
  progressCtrl.getChapterProgress
);
router.post(
  '/group/:classGroupId/sync',
  authenticateToken,
  requireRegloForStudents,
  progressCtrl.syncProgress
);
router.get(
  '/group/:classGroupId',
  authenticateToken,
  requireRegloForStudents,
  progressCtrl.getGroupProgress
);

module.exports = router;
