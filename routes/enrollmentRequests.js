const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/enrollmentRequestController');
const { authenticateToken, authorizeRoles, authorizeAdminLevels } = require('../middleware/auth');

router.post('/', ctrl.createEnrollmentRequest);

router.get('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.listEnrollmentRequests);
router.get('/:id', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.getEnrollmentRequest);
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.updateEnrollmentStatus);
router.post('/:id/approve', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.approveEnrollmentRequest);
router.post('/:id/contact', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.contactEnrollmentRequest);

module.exports = router;
