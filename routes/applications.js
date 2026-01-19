const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles 
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
router.get('/', authenticateToken, authorizeRoles('admin'), getAllApplications);
router.get('/stats/overview', authenticateToken, authorizeRoles('admin'), getApplicationStats);
router.get('/:id', authenticateToken, authorizeRoles('admin'), getApplicationById);
router.put('/:id', authenticateToken, authorizeRoles('admin'), updateApplication);
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), updateStatus);
router.post('/:id/communication', authenticateToken, authorizeRoles('admin'), addCommunication);
router.post('/:id/test', authenticateToken, authorizeRoles('admin'), scheduleTest);
router.post('/:id/evaluate', authenticateToken, authorizeRoles('admin'), evaluateApplication);

module.exports = router; 