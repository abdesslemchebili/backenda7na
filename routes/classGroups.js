const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, requireRegloForStudents } = require('../middleware/auth');
const classGroupController = require('../controllers/classGroupController');
const documentController = require('../controllers/documentController');
const attendanceController = require('../controllers/attendanceController');
const assignmentController = require('../controllers/assignmentController');
const { uploadDocument: uploadDocMw } = require('../middleware/upload');

router.get('/', authenticateToken, classGroupController.list);
router.post('/', authenticateToken, classGroupController.create);

// Nested resources (before /:id)
router.get(
  '/:classGroupId/documents',
  authenticateToken,
  requireRegloForStudents,
  documentController.listByClassGroup
);
router.post(
  '/:classGroupId/documents',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  uploadDocMw,
  documentController.uploadDocument
);
router.get(
  '/:classGroupId/attendance',
  authenticateToken,
  attendanceController.getByClassGroup
);
router.get(
  '/:classGroupId/assignments',
  authenticateToken,
  requireRegloForStudents,
  assignmentController.listByClassGroup
);
router.post(
  '/:classGroupId/assignments',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  assignmentController.createAssignment
);

router.get('/:id', authenticateToken, classGroupController.getById);
router.put('/:id', authenticateToken, classGroupController.update);

module.exports = router;
