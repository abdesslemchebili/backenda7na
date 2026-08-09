const express = require('express');
const router = express.Router();
const {
  authenticateToken,
  authorizeRoles,
  requireRegloForStudents,
} = require('../middleware/auth');
const {
  getBySession,
  createOrUpdate,
  updateRecording,
  getAccessUrl,
} = require('../controllers/recordingController');

router.get('/session/:classId', authenticateToken, requireRegloForStudents, getBySession);
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), createOrUpdate);
router.patch('/:id', authenticateToken, authorizeRoles('professor', 'admin'), updateRecording);
router.get('/:id/access', authenticateToken, requireRegloForStudents, getAccessUrl);

module.exports = router;
