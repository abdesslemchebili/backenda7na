const express = require('express');
const router = express.Router();
const gamificationCtrl = require('../controllers/gamificationController');
const { authenticateToken, requireRegloForStudents } = require('../middleware/auth');

router.get('/me', authenticateToken, requireRegloForStudents, gamificationCtrl.getMyProfile);
router.get('/badges', authenticateToken, gamificationCtrl.listBadges);

module.exports = router;
