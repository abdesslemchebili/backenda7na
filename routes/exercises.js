const express = require('express');
const router = express.Router();
const exerciseCtrl = require('../controllers/exerciseController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeAdminLevels,
  requireRegloForStudents,
} = require('../middleware/auth');

const contentAdmin = [
  authenticateToken,
  authorizeRoles('admin'),
  authorizeAdminLevels('super', 'full', 'content'),
];

router.get('/', authenticateToken, requireRegloForStudents, exerciseCtrl.listExercises);
router.get('/submissions/me', authenticateToken, requireRegloForStudents, exerciseCtrl.getMySubmissions);
router.get('/:id', authenticateToken, requireRegloForStudents, exerciseCtrl.getExercise);
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), exerciseCtrl.createExercise);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), exerciseCtrl.updateExercise);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), exerciseCtrl.deleteExercise);
router.post('/:id/submit', authenticateToken, requireRegloForStudents, exerciseCtrl.submitExercise);
router.get('/:id/submissions', authenticateToken, requireRegloForStudents, exerciseCtrl.getSubmissions);
router.patch(
  '/submissions/:id/grade',
  authenticateToken,
  authorizeRoles('professor', 'admin'),
  exerciseCtrl.gradeSubmission
);

module.exports = router;
