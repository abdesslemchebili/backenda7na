const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, requireRegloForStudents } = require('../middleware/auth');
const assignmentController = require('../controllers/assignmentController');
const { uploadDocument: uploadAssignmentMw } = require('../middleware/upload');

router.patch('/:id', authenticateToken, authorizeRoles('professor', 'admin'), assignmentController.updateAssignment);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), assignmentController.deleteAssignment);
router.patch('/submissions/:submissionId/grade', authenticateToken, authorizeRoles('professor', 'admin'), assignmentController.gradeSubmission);
router.post('/:id/submit', authenticateToken, requireRegloForStudents, uploadAssignmentMw, assignmentController.submitAssignment);
router.get('/:id/submissions', authenticateToken, assignmentController.getSubmissions);

module.exports = router;
