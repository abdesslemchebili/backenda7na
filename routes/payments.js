const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { authenticateToken, authorizeRoles, authorizeAdminLevels } = require('../middleware/auth');

router.post('/', authenticateToken, authorizeRoles('student'), ctrl.submitPayment);
router.get('/me', authenticateToken, authorizeRoles('student'), ctrl.getMyPayments);
router.get('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.listPayments);
router.patch('/:id/review', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), ctrl.reviewPayment);

module.exports = router;
