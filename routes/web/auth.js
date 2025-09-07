// routes/api/auth.js (version corrigée)
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const { protect, guest, authorize } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   POST /api/auth/register
 * @desc    Inscription d'un nouvel utilisateur
 * @access  Public
 */
router.post('/register', guest, authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Connexion utilisateur
 * @access  Public
 */
router.post('/login', guest, authController.login);

/**
 * @route   GET /api/auth/verify/:id/:token
 * @desc    Vérification de l'email
 * @access  Public
 */
router.get('/verify/:id/:token', authController.verifyEmail);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Renvoyer un email de vérification
 * @access  Public
 */
router.post('/resend-verification', guest, authController.resendVerification);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Demande de réinitialisation de mot de passe
 * @access  Public
 */
router.post('/forgot-password', guest, authController.forgotPassword);

/**
 * @route   GET /api/auth/verify-reset/:token
 * @desc    Vérification du token de réinitialisation
 * @access  Public
 */
router.get('/verify-reset/:token', authController.verifyPasswordReset);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Réinitialisation du mot de passe
 * @access  Public
 */
router.post('/reset-password', guest, authController.resetPassword);

/**
 * @route   POST /api/auth/change-password
 * @desc    Changement de mot de passe (utilisateur connecté)
 * @access  Private
 */
router.post('/change-password', 
  protect, 
  logAction('TENTATIVE_CHANGEMENT_MDP', 'Tentative de changement de mot de passe'),
  authController.changePassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    Déconnexion (invalidation du token)
 * @access  Private
 */
router.post('/logout', 
  protect, 
  logAction('DECONNEXION', 'Déconnexion de l\'utilisateur'),
  authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Obtenir les informations de l'utilisateur connecté
 * @access  Private
 */
router.get('/me', protect, authController.getMe);

module.exports = router;