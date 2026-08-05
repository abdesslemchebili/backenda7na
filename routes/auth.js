const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'Too many requests',
    message: 'Too many authentication attempts. Please try again later.'
  }
});

// Routes publiques
router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.post('/refresh', authLimiter, authController.refreshTokenHandler);
router.post('/request-password-reset', authLimiter, authController.requestPasswordReset);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.post('/resend-verification', authLimiter, authController.resendVerificationEmail);
router.get('/verify', authController.verifyEmail);
router.get('/verify/:token', authController.verifyEmail);

// Routes protégées
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/change-password', authenticateToken, authController.changePassword);
router.post('/logout', authenticateToken, authController.logout);

// Routes admin seulement
router.post('/invite', authenticateToken, authorizeRoles('admin'), authController.inviteUser);

module.exports = router;
