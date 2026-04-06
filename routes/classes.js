const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles, 
  requireStudentStatus 
} = require('../middleware/auth');
const {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  startSession,
  endSession,
  enrollStudent,
  getLiveClasses,
  getUpcomingClasses
} = require('../controllers/classController');
const attendanceController = require('../controllers/attendanceController');

// Routes avec authentification
router.get('/', authenticateToken, getAllClasses);
router.get('/live', authenticateToken, getLiveClasses);
router.get('/upcoming', authenticateToken, getUpcomingClasses);
router.get('/:id', authenticateToken, getClassById);

// Routes pour professeurs et admins
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), createClass);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), updateClass);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), deleteClass);
router.post('/:id/start', authenticateToken, authorizeRoles('professor', 'admin'), startSession);
router.post('/:id/end', authenticateToken, authorizeRoles('professor', 'admin'), endSession);

// Routes pour étudiants
router.post('/:id/enroll', authenticateToken, requireStudentStatus, enrollStudent);

// Routes pour professeurs et admins (gestion de la présence)
router.post('/:id/attendance', authenticateToken, authorizeRoles('professor', 'admin'), attendanceController.markAttendance);

module.exports = router; 