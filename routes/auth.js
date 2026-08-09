const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createAuthLimiter } = require('../utils/rateLimit');

const loginLimiter = createAuthLimiter();
const refreshLimiter = createAuthLimiter(
  parseInt(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 10) || 300
);

// Routes publiques — refresh a une limite plus haute (appels fréquents légitimes)
router.post('/login', loginLimiter, authController.login);
router.post('/register', loginLimiter, authController.register);
router.post('/refresh', refreshLimiter, authController.refreshTokenHandler);
router.post('/request-password-reset', loginLimiter, authController.requestPasswordReset);
router.post('/reset-password', loginLimiter, authController.resetPassword);
router.post('/resend-verification', loginLimiter, authController.resendVerificationEmail);
router.get('/verify', authController.verifyEmail);
router.get('/verify/:token', authController.verifyEmail);

// Routes protégées
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/change-password', authenticateToken, authController.changePassword);
router.post('/logout', authenticateToken, authController.logout);

// Routes admin seulement
router.post('/invite', authenticateToken, authorizeRoles('admin'), authController.inviteUser);

module.exports = router;
