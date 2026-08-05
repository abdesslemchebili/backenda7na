const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles, authorizeAdminLevels } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

router.get('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full'), settingsController.getSettings);
router.put('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full'), settingsController.updateSettings);
router.post('/announcement', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full'), settingsController.sendAnnouncement);

module.exports = router;
