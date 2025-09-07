// routes/api/videos.js
const express = require('express');
const router = express.Router();
const videoController = require('../../controllers/videoController');
const publicVideoController = require('../../controllers/publicVideoController');
const memoryController = require('../../controllers/memoryController');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const { upload, handleMulterError } = require('../../middlewares/upload.middleware');

// Routes publiques
router.get('/', publicVideoController.getPublicVideos);
router.get('/trending', publicVideoController.getTrendingVideos);
router.get('/genre/:genre', publicVideoController.getVideosByGenre);
router.get('/decade/:decade', publicVideoController.getVideosByDecade);
router.get('/search', publicVideoController.searchVideos);
router.get('/:id', publicVideoController.getVideoById);

// Routes d'interaction (likes, vues, etc.)
router.post('/:id/like', protect, publicVideoController.likeVideo);
router.post('/:id/dislike', protect, publicVideoController.dislikeVideo);
router.post('/:id/share', protect, (req, res) => {
  // Enregistrement simple du partage
  res.status(200).json({
    success: true,
    message: "Partage enregistré avec succès"
  });
});

// Routes pour les souvenirs (commentaires)
router.get('/:id/memories', memoryController.getVideoMemories);
router.post('/:id/memories', protect, memoryController.addMemory);

// Routes pour la création/modification de vidéos
router.post('/', protect, videoController.createVideo);
router.put('/:id', protect, videoController.updateVideo);
router.patch('/:id', protect, videoController.updateVideo);
router.delete('/:id', protect, videoController.deleteVideo);

// Routes spécifiques pour les shorts (avec upload de fichier)
router.post('/shorts', protect, upload, handleMulterError, videoController.createShort);
// Routes admin
router.get('/admin/all', protect, authorize('admin', 'superadmin'), videoController.listPublicVideosForAdmin);
router.get('/admin/shorts', protect, authorize('admin', 'superadmin'), videoController.listShortsForAdmin);
router.get('/genres', videoController.getGenres);

module.exports = router;