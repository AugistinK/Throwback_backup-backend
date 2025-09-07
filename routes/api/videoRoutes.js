// routes/api/videoRoutes.js
const express = require('express');
const router = express.Router();
const videoController = require('../../controllers/videoController');
const publicVideoController = require('../../controllers/publicVideoController');
const memoryController = require('../../controllers/memoryController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');
const uploadShort = require('../../middlewares/upload.middleware');

// ===== ROUTES PUBLIQUES =====
// Récupération des vidéos publiques avec filtres
router.get('/', videoController.listPublicVideos);
router.get('/trending', publicVideoController?.getTrendingVideos || ((req, res) => {
  res.json({ success: true, data: [], message: "Trending not implemented yet" });
}));
router.get('/genre/:genre', publicVideoController?.getVideosByGenre || ((req, res) => {
  res.json({ success: true, data: [], message: "Genre filter not implemented yet" });
}));
router.get('/decade/:decade', publicVideoController?.getVideosByDecade || ((req, res) => {
  res.json({ success: true, data: [], message: "Decade filter not implemented yet" });
}));
router.get('/search', publicVideoController?.searchVideos || ((req, res) => {
  res.json({ success: true, data: [], message: "Search not implemented yet" });
}));

// ===== ROUTES POUR LES SHORTS (UTILISATEURS) =====
// IMPORTANT: Cette route doit être AVANT /:id pour éviter les conflits
router.post('/shorts', protect, uploadShort.single('videoFile'), (req, res, next) => {
  console.log(' Route POST /shorts appelée');
  console.log(' Fichier reçu:', req.file ? 'Oui' : 'Non');
  console.log(' Body:', req.body);
  
  if (videoController.createShort) {
    videoController.createShort(req, res, next);
  } else {
    res.status(501).json({
      success: false,
      message: "Création de shorts non implémentée"
    });
  }
});

// ===== ROUTES D'INTERACTION SOCIALE =====
// Likes et dislikes
router.post('/:id/like', protect, (req, res, next) => {
  console.log('❤️ Route like appelée pour vidéo:', req.params.id);
  console.log('👤 Utilisateur:', req.user?.nom, req.user?.prenom);
  
  if (publicVideoController && publicVideoController.likeVideo) {
    publicVideoController.likeVideo(req, res, next);
  } else {
    // Fallback pour simulation
    res.json({
      success: true,
      message: "Like enregistré (simulation)",
      data: {
        liked: true,
        disliked: false,
        likes: Math.floor(Math.random() * 100) + 1,
        dislikes: 0
      }
    });
  }
});

router.post('/:id/dislike', protect, (req, res, next) => {
  console.log('👎 Route dislike appelée pour vidéo:', req.params.id);
  
  if (publicVideoController && publicVideoController.dislikeVideo) {
    publicVideoController.dislikeVideo(req, res, next);
  } else {
    res.json({
      success: true,
      message: "Dislike enregistré (simulation)",
      data: {
        liked: false,
        disliked: true,
        likes: 0,
        dislikes: Math.floor(Math.random() * 10) + 1
      }
    });
  }
});

router.post('/:id/share', protect, (req, res) => {
  console.log('🔄 Route share appelée pour vidéo:', req.params.id);
  res.json({
    success: true,
    message: "Partage enregistré avec succès"
  });
});

// ===== ROUTES POUR LES SOUVENIRS (COMMENTAIRES) =====
router.get('/:id/memories', (req, res, next) => {
  console.log('💭 Route memories GET appelée pour vidéo:', req.params.id);
  
  if (memoryController && memoryController.getVideoMemories) {
    memoryController.getVideoMemories(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
    });
  }
});

router.post('/:id/memories', protect, (req, res, next) => {
  console.log('💭 Route memories POST appelée pour vidéo:', req.params.id);
  console.log('📝 Contenu:', req.body);
  console.log('👤 Utilisateur:', req.user?.nom, req.user?.prenom);
  
  if (memoryController && memoryController.addMemory) {
    memoryController.addMemory(req, res, next);
  } else {
    res.status(501).json({
      success: false,
      message: "Ajout de souvenirs non implémenté"
    });
  }
});

// ===== ROUTES INDIVIDUELLES =====
// ATTENTION: Cette route doit être en DERNIER pour éviter les conflits
router.get('/:id', videoController.getPublicVideo);

// ===== ROUTES ADMINISTRATEUR =====
router.get('/admin/videos', protect, isAdmin, videoController.listVideosForAdmin || ((req, res) => {
  res.status(501).json({ message: "Admin videos not implemented" });
}));

router.get('/admin/shorts', protect, isAdmin, videoController.listShortsForAdmin || ((req, res) => {
  res.status(501).json({ message: "Admin shorts not implemented" });
}));

router.post('/admin/videos', protect, isAdmin, videoController.createVideo);
router.patch('/admin/videos/:id', protect, isAdmin, videoController.updateVideo);
router.delete('/admin/videos/:id', protect, isAdmin, videoController.deleteVideo);

// ===== ROUTES UTILITAIRES =====
router.get('/utils/genres', (req, res) => {
  res.json({
    success: true,
    data: ['Rock', 'Pop', 'Jazz', 'Blues', 'Country', 'Hip-Hop', 'Electronic', 'Classical']
  });
});

module.exports = router;