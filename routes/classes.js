const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles, 
  requireStudentStatus,
  requireRegloForStudents
} = require('../middleware/auth');
const {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getJoinToken,
  getScheduleConflicts,
  startSession,
  endSession,
  enrollStudent,
  markAttendance,
  getLiveClasses,
  getUpcomingClasses
} = require('../controllers/classController');
const attendanceController = require('../controllers/attendanceController');

// Routes avec authentification — routes statiques AVANT /:id (sinon "schedule-conflicts" est pris pour un id)
router.get('/', authenticateToken, requireRegloForStudents, getAllClasses);
router.get('/live', authenticateToken, requireRegloForStudents, getLiveClasses);
router.get('/upcoming', authenticateToken, requireRegloForStudents, getUpcomingClasses);
router.get('/schedule-conflicts', authenticateToken, authorizeRoles('professor', 'admin'), getScheduleConflicts);
router.get('/:id/join-token', authenticateToken, requireRegloForStudents, getJoinToken);
router.get('/:id', authenticateToken, requireRegloForStudents, getClassById);

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