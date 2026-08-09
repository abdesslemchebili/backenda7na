const express = require('express');
const router = express.Router();
const progressCtrl = require('../controllers/progressController');
const { authenticateToken, requireRegloForStudents } = require('../middleware/auth');

router.get('/course/:courseId/leaderboard', authenticateToken, requireRegloForStudents, progressCtrl.getLeaderboard);
router.get('/course/:courseId/chapters', authenticateToken, requireRegloForStudents, progressCtrl.getChapterProgress);
router.post('/course/:courseId/sync', authenticateToken, requireRegloForStudents, progressCtrl.syncProgress);
router.get('/course/:courseId', authenticateToken, requireRegloForStudents, progressCtrl.getCourseProgress);

module.exports = router;
