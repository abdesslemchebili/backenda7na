const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles, 
  requireStudentStatus,
  requireCourseEnrollment 
} = require('../middleware/auth');
const {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollStudent,
  unenrollStudent,
  updateProgress,
  getFeaturedCourses,
  searchCourses
} = require('../controllers/courseController');

// Routes publiques (avec authentification optionnelle)
// Note: getAllCourses and getCourseById handle optional auth internally
router.get('/', getAllCourses);
router.get('/featured', getFeaturedCourses);
router.get('/search', searchCourses);
router.get('/:id', getCourseById);

// Routes pour professeurs et admins
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), createCourse);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), updateCourse);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), deleteCourse);

// Routes pour étudiants
router.post('/:id/enroll', authenticateToken, requireStudentStatus, enrollStudent);
router.delete('/:id/enroll', authenticateToken, requireStudentStatus, unenrollStudent);

// Routes pour professeurs et admins (gestion du progrès)
router.patch('/:id/progress', authenticateToken, authorizeRoles('professor', 'admin'), updateProgress);

module.exports = router; 