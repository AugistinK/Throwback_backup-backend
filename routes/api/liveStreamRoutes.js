// routes/api/livestreamRoutes.js
const express = require('express');
const router = express.Router();
const liveStreamController = require('../../controllers/liveStreamController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');

/**
 * Middleware pour mettre à jour automatiquement les statuts des streams
 * Appliqué à toutes les routes admin
 */
router.use(liveStreamController.autoUpdateStreams);

/**
 * @route   GET /api/admin/livestreams/stats
 * @desc    Récupérer les statistiques des livestreams
 * @access  Private/Admin
 */
router.get('/stats', protect, isAdmin, liveStreamController.getLiveStreamStats);

/**
 * @route   GET /api/admin/livestreams/all
 * @desc    Récupérer tous les livestreams (admin)
 * @access  Private/Admin
 */
router.get('/all', protect, isAdmin, liveStreamController.getAllLiveStreamsAdmin);

/**
 * @route   GET /api/admin/livestreams/live
 * @desc    Récupérer les livestreams en cours
 * @access  Private/Admin
 */
router.get('/live', protect, isAdmin, liveStreamController.getLiveStreams);

/**
 * @route   GET /api/admin/livestreams/scheduled
 * @desc    Récupérer les livestreams programmés
 * @access  Private/Admin
 */
router.get('/scheduled', protect, isAdmin, liveStreamController.getScheduledLiveStreams);

/**
 * @route   POST /api/admin/livestreams
 * @desc    Créer un nouveau livestream
 * @access  Private/Admin
 */
router.post('/', protect, isAdmin, liveStreamController.createLiveStream);

/**
 * @route   GET /api/admin/livestreams/:id
 * @desc    Récupérer un livestream par ID
 * @access  Private/Admin
 */
router.get('/:id', protect, isAdmin, liveStreamController.getLiveStreamById);

/**
 * @route   PUT /api/admin/livestreams/:id
 * @desc    Mettre à jour un livestream
 * @access  Private/Admin
 */
router.put('/:id', protect, isAdmin, liveStreamController.updateLiveStream);

/**
 * @route   DELETE /api/admin/livestreams/:id
 * @desc    Supprimer un livestream
 * @access  Private/Admin
 */
router.delete('/:id', protect, isAdmin, liveStreamController.deleteLiveStream);

/**
 * @route   PUT /api/admin/livestreams/:id/start
 * @desc    Démarrer un livestream
 * @access  Private/Admin
 */
router.put('/:id/start', protect, isAdmin, liveStreamController.startLiveStream);

/**
 * @route   PUT /api/admin/livestreams/:id/end
 * @desc    Terminer un livestream
 * @access  Private/Admin
 */
router.put('/:id/end', protect, isAdmin, liveStreamController.endLiveStream);

/**
 * @route   PUT /api/admin/livestreams/:id/cancel
 * @desc    Annuler un livestream
 * @access  Private/Admin
 */
router.put('/:id/cancel', protect, isAdmin, liveStreamController.cancelLiveStream);

/**
 * @route   GET /api/admin/livestreams/:id/comments
 * @desc    Récupérer les commentaires d'un livestream pour modération
 * @access  Private/Admin
 */
router.get('/:id/comments', protect, isAdmin, liveStreamController.getLiveStreamComments);

/**
 * @route   DELETE /api/admin/livestreams/:id/comments/:commentId
 * @desc    Supprimer un commentaire
 * @access  Private/Admin
 */
router.delete('/:id/comments/:commentId', protect, isAdmin, liveStreamController.deleteComment);

/**
 * @route   POST /api/admin/livestreams/:id/ban-user
 * @desc    Bannir un utilisateur du chat
 * @access  Private/Admin
 */
router.post('/:id/ban-user', protect, isAdmin, liveStreamController.banUserFromChat);

/**
 * @route   POST /api/admin/livestreams/:id/unban-user
 * @desc    Débannir un utilisateur du chat
 * @access  Private/Admin
 */
router.post('/:id/unban-user', protect, isAdmin, liveStreamController.unbanUserFromChat);

module.exports = router;