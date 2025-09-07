// routes/api/auth.js - Routes API pour React
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { protect, guest, authorize } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register', guest, authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    User login
 * @access  Public
 */
router.post('/login', guest, authController.login);

/**
 * @route   GET /api/auth/verify/:id/:token
 * @desc    Email verification
 * @access  Public
 */
router.get('/verify/:id/:token', authController.verifyEmail);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend verification email
 * @access  Public
 */
router.post('/resend-verification', guest, authController.resendVerification);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', guest, authController.forgotPassword);

/**
 * @route   GET /api/auth/verify-reset/:token
 * @desc    Verify reset token
 * @access  Public
 */
router.get('/verify-reset/:token', authController.verifyPasswordReset);

/**
 * @route   PUT /api/auth/reset-password
 * @desc    Reset password
 * @access  Public
 */
router.put('/reset-password', authController.resetPassword);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password (logged in user)
 * @access  Private
 */
router.put('/change-password', 
  protect, 
  logAction('TENTATIVE_CHANGEMENT_MDP', 'Password change attempt'),
  authController.changePassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout
 * @access  Private
 */
router.post('/logout', 
  protect, 
  logAction('DECONNEXION', 'User logout'),
  authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', protect, authController.getMe);

module.exports = router;