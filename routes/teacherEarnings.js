const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherEarningController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/me', authenticateToken, authorizeRoles('professor'), ctrl.getMyEarnings);
router.get('/', authenticateToken, authorizeRoles('admin'), ctrl.listAllEarnings);
router.post('/close-month', authenticateToken, authorizeRoles('admin'), ctrl.closeMonth);
router.get('/:professorId', authenticateToken, authorizeRoles('admin'), ctrl.getProfessorEarnings);
router.post('/:professorId/sessions', authenticateToken, authorizeRoles('admin'), ctrl.addSessionHours);
router.put('/:professorId/rate', authenticateToken, authorizeRoles('admin'), ctrl.setHourlyRate);

module.exports = router;
