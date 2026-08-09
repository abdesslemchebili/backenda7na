const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/languageController');
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

router.get('/', optionalAuth, ctrl.listLanguages);
router.post('/seed', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), ctrl.seedLanguages);
router.get('/:id', optionalAuth, ctrl.getLanguage);
router.post('/', ...contentAdmin, ctrl.createLanguage);
router.put('/:id', ...contentAdmin, ctrl.updateLanguage);

module.exports = router;
