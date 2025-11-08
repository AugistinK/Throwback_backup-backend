// routes/api/public.js
const express = require('express');
const router = express.Router();
const publicVideoController = require('../../controllers/publicVideoController');
const memoryController = require('../../controllers/memoryController');
const { protect } = require('../../middlewares/authMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');

// --- Vidéos publiques ---
router.get('/videos', optionalAuth, publicVideoController.getPublicVideos);
router.get('/videos/trending', optionalAuth, publicVideoController.getTrendingVideos);
router.get('/videos/genre/:genre', optionalAuth, publicVideoController.getVideosByGenre);
router.get('/videos/decade/:decade', optionalAuth, publicVideoController.getVideosByDecade);
router.get('/videos/search', optionalAuth, publicVideoController.searchVideos);
router.get('/videos/:id', optionalAuth, publicVideoController.getVideoById);

// Interactions vidéo
router.post('/videos/:id/like', protect, publicVideoController.likeVideo);
router.post('/videos/:id/dislike', protect, publicVideoController.dislikeVideo);
router.post('/videos/:id/share', protect, (req, res) => res.json({ success: true, message: 'Share recorded' }));

// --- Souvenirs (commentaires) ---
// Commentaires d’une vidéo (filtrage strict côté controller)
router.get('/videos/:id/memories', optionalAuth, memoryController.getVideoMemories);
router.post('/videos/:id/memories', protect, memoryController.addMemory);

// Récent (liste générale)
router.get('/memories/recent', memoryController.getRecentMemories);

// Replies
router.get('/memories/:id/replies', memoryController.getMemoryReplies);
router.post('/memories/:id/replies', protect, memoryController.addReply);

// ⚠️ Ajout des routes publiques manquantes pour like/dislike/delete d’un souvenir/réponse
router.post('/memories/:id/like', protect, memoryController.likeMemory);
router.post('/memories/:id/dislike', protect, memoryController.dislikeMemory);
router.delete('/memories/:id', protect, memoryController.deleteMemory);

module.exports = router;
