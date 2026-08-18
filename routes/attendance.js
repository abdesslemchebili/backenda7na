const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const attendanceController = require('../controllers/attendanceController');

router.get('/group/:classGroupId', authenticateToken, attendanceController.getByClassGroup);
router.get('/student/:studentId', authenticateToken, attendanceController.getByStudent);
router.get(
  '/export',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  attendanceController.exportAttendance
);

module.exports = router;
