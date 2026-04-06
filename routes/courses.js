const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  optionalAuth,
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
const documentController = require('../controllers/documentController');
const attendanceController = require('../controllers/attendanceController');
const assignmentController = require('../controllers/assignmentController');
const { uploadDocument: uploadDocMw } = require('../middleware/upload');

// Routes publiques (authentification optionnelle pour filtrage par rôle)
router.get('/', optionalAuth, getAllCourses);
router.get('/featured', getFeaturedCourses);
router.get('/search', optionalAuth, searchCourses);
// Course documents (before /:id so :courseId/documents matches)
router.get('/:courseId/documents', authenticateToken, documentController.listByCourse);
router.get('/:courseId/attendance', authenticateToken, attendanceController.getByCourse);
router.get('/:courseId/assignments', authenticateToken, assignmentController.listByCourse);
router.post('/:courseId/documents', authenticateToken, authorizeRoles('professor', 'admin'), uploadDocMw, documentController.uploadDocument);
router.post('/:courseId/assignments', authenticateToken, authorizeRoles('professor', 'admin'), assignmentController.createAssignment);
router.get('/:id', optionalAuth, getCourseById);

// Routes pour professeurs et admins
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), createCourse);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), updateCourse);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), deleteCourse);

// Routes pour étudiants (unenroll: professor/admin can pass ?studentId=)
router.post('/:id/enroll', authenticateToken, requireStudentStatus, enrollStudent);
router.delete('/:id/enroll', authenticateToken, unenrollStudent);

// Routes pour professeurs et admins (gestion du progrès)
router.patch('/:id/progress', authenticateToken, authorizeRoles('professor', 'admin'), updateProgress);

module.exports = router; 