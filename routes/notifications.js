const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.get('/', authenticateToken, notificationController.getMyNotifications);
router.get('/me', authenticateToken, notificationController.getMyNotifications);
router.post('/', authenticateToken, authorizeRoles('admin'), notificationController.createNotification);
router.patch('/:id/read', authenticateToken, notificationController.markOneRead);
router.post('/mark-read', authenticateToken, notificationController.markReadBulk);

module.exports = router;
