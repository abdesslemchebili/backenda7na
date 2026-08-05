const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/placementTestController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/active', authenticateToken, authorizeRoles('student'), ctrl.getActivePlacementTest);
router.post('/submit', authenticateToken, authorizeRoles('student'), ctrl.submitPlacementTest);

router.get('/', authenticateToken, authorizeRoles('admin'), ctrl.listPlacementTests);
router.post('/', authenticateToken, authorizeRoles('admin'), ctrl.createPlacementTest);
router.put('/:id', authenticateToken, authorizeRoles('admin'), ctrl.updatePlacementTest);
router.patch('/submissions/:studentId/override', authenticateToken, authorizeRoles('admin'), ctrl.overridePlacementLevel);

module.exports = router;
