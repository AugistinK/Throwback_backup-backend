// routes/api/userLivestreams.js
const express = require('express');
const router = express.Router();
const userLiveStreamController = require('../../controllers/userLiveStreamController');
const { protect } = require('../../middlewares/authMiddleware');

/**
 * Middleware pour mettre à jour automatiquement les statuts des streams
 * Appliqué à toutes les routes importantes
 */
router.use(userLiveStreamController.autoUpdateStreams);

/**
 * @route   GET /api/user/livestreams
 * @desc    Récupérer tous les livestreams actifs pour les utilisateurs
 * @access  Public
 * @query   {boolean} activeOnly - Filtrer seulement les streams LIVE non expirés
 */
router.get('/', userLiveStreamController.getActiveLiveStreams);

/**
 * @route   GET /api/user/livestreams/:id
 * @desc    Récupérer un livestream spécifique par ID
 * @access  Public
 */
router.get('/:id', userLiveStreamController.getLiveStreamById);

/**
 * @route   POST /api/user/livestreams/:id/like
 * @desc    Ajouter un like à un livestream
 * @access  Private
 */
router.post('/:id/like', protect, userLiveStreamController.likeLiveStream);

/**
 * @route   POST /api/user/livestreams/:id/comment
 * @desc    Ajouter un commentaire à un livestream (redirige vers livechat)
 * @access  Private
 */
router.post('/:id/comment', protect, userLiveStreamController.commentLiveStream);

/**
 * @route   GET /api/user/livestreams/:id/comments
 * @desc    Récupérer les commentaires d'un livestream (redirige vers livechat)
 * @access  Public
 */
router.get('/:id/comments', userLiveStreamController.getLiveStreamComments);

module.exports = router;