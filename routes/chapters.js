const express = require('express');
const router = express.Router();
const chapterCtrl = require('../controllers/chapterController');
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

router.get('/:id', optionalAuth, chapterCtrl.getChapter);
router.put('/:id', ...contentAdmin, chapterCtrl.updateChapter);
router.delete('/:id', ...contentAdmin, chapterCtrl.deleteChapter);

module.exports = router;
