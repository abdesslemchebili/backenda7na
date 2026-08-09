const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/enrollmentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/', authenticateToken, ctrl.listEnrollments);
router.post('/', authenticateToken, authorizeRoles('admin', 'professor'), ctrl.createEnrollment);
router.patch('/:id', authenticateToken, ctrl.updateEnrollment);

module.exports = router;
