const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Routes publiques
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh', authController.refreshTokenHandler);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.post('/resend-verification', authController.resendVerificationEmail);
router.get('/verify', authController.verifyEmail);        // ?token=...
router.get('/verify/:token', authController.verifyEmail); // /verify/xxx

// Routes protégées
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/logout', authenticateToken, authController.logout);

// Routes admin seulement
router.post('/invite', authenticateToken, authorizeRoles('admin'), authController.inviteUser);

module.exports = router; 