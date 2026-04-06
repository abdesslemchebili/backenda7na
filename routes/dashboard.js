const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/student', authenticateToken, authorizeRoles('student'), dashboardController.getStudentDashboard);
router.get('/professor', authenticateToken, authorizeRoles('professor'), dashboardController.getProfessorDashboard);
router.get('/admin', authenticateToken, authorizeRoles('admin'), dashboardController.getAdminDashboard);

module.exports = router;
