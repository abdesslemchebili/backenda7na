const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/levelController');
const {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  authorizeAdminLevels,
} = require('../middleware/auth');

const contentAdmin = [
  authenticateToken,
  authorizeRoles('admin'),
  authorizeAdminLevels('super', 'full', 'content'),
];

router.get('/', optionalAuth, ctrl.listLevels);
router.get('/:id', optionalAuth, ctrl.getLevel);
router.post('/', ...contentAdmin, ctrl.createLevel);
router.put('/:id', ...contentAdmin, ctrl.updateLevel);

module.exports = router;
