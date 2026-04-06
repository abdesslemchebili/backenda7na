const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const assignmentController = require('../controllers/assignmentController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads/documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir }).single('file');

router.patch('/submissions/:submissionId/grade', authenticateToken, authorizeRoles('professor', 'admin'), assignmentController.gradeSubmission);
router.post('/:id/submit', authenticateToken, upload, assignmentController.submitAssignment);
router.get('/:id/submissions', authenticateToken, assignmentController.getSubmissions);

module.exports = router;
