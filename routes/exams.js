const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/examController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/submissions/me', authenticateToken, authorizeRoles('student'), ctrl.getMyExamSubmissions);
router.get('/', authenticateToken, ctrl.listExams);
router.get('/:id', authenticateToken, ctrl.getExam);
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), ctrl.createExam);
router.post('/:id/submit', authenticateToken, authorizeRoles('student'), ctrl.submitExam);
router.patch('/submissions/:id/override', authenticateToken, authorizeRoles('admin'), ctrl.overrideExamResult);

module.exports = router;
