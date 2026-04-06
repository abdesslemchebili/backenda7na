const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const attendanceController = require('../controllers/attendanceController');

router.get('/course/:courseId', authenticateToken, attendanceController.getByCourse);
router.get('/student/:studentId', authenticateToken, attendanceController.getByStudent);
router.get('/export', authenticateToken, attendanceController.exportAttendance);

module.exports = router;
