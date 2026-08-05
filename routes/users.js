const express = require('express');
const router = express.Router();
const { 
  authenticateToken, 
  authorizeRoles, 
  authorizeAdminLevels,
  requireUserOwnership 
} = require('../middleware/auth');
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  changeUserRole,
  getUserStats,
  getMyProfile,
  updateMyProfile
} = require('../controllers/userController');
const attendanceController = require('../controllers/attendanceController');

// Routes publiques (nécessitent authentification)
router.get('/profile', authenticateToken, getMyProfile);
router.put('/profile', authenticateToken, updateMyProfile);
router.get('/me/attendance', authenticateToken, attendanceController.getByStudent);

// Routes admin seulement
router.get('/', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), getAllUsers);
router.get('/stats/overview', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), getUserStats);
router.delete('/:id', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full'), deleteUser);
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super', 'full', 'support'), updateUserStatus);
router.patch('/:id/role', authenticateToken, authorizeRoles('admin'), authorizeAdminLevels('super'), changeUserRole);

// Routes pour admin ou propriétaire du profil
router.get('/:id', authenticateToken, requireUserOwnership, getUserById);
router.put('/:id', authenticateToken, requireUserOwnership, updateUser);

module.exports = router; 