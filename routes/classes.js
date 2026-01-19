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
  enrollStudent,
  markAttendance,
  getLiveClasses,
  getUpcomingClasses
} = require('../controllers/classController');

// Routes publiques
router.get('/live', getLiveClasses);
router.get('/upcoming', getUpcomingClasses);

// Routes avec authentification
router.get('/', authenticateToken, getAllClasses);
router.get('/:id', authenticateToken, getClassById);

// Routes pour professeurs et admins
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), createClass);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), updateClass);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), deleteClass);

// Routes pour étudiants
router.post('/:id/enroll', authenticateToken, requireStudentStatus, enrollStudent);

// Routes pour professeurs et admins (gestion de la présence)
router.post('/:id/attendance', authenticateToken, authorizeRoles('professor', 'admin'), markAttendance);

module.exports = router; 