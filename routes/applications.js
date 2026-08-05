const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles,
  authorizeAdminLevels
} = require('../middleware/auth');
const {
  getAllApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  updateStatus,
  addCommunication,
  scheduleTest,
  evaluateApplication,
  getApplicationStats
} = require('../controllers/applicationController');

// Routes publiques
router.post('/', createApplication);

// Routes admin seulement
router.get('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), getAllApplications);
router.get('/stats/overview', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), getApplicationStats);
router.get('/:id', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), getApplicationById);
router.put('/:id', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), updateApplication);
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), updateStatus);
router.post('/:id/communication', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), addCommunication);
router.post('/:id/test', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), scheduleTest);
router.post('/:id/evaluate', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'content'), evaluateApplication);

module.exports = router; 