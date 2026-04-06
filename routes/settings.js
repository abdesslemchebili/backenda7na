const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

router.get('/', authenticateToken, authorizeRoles('admin'), settingsController.getSettings);
router.put('/', authenticateToken, authorizeRoles('admin'), settingsController.updateSettings);
router.post('/announcement', authenticateToken, authorizeRoles('admin'), settingsController.sendAnnouncement);

module.exports = router;
