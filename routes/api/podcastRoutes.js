// file_create: /home/claude/podcast_routes_fixed.js
const express = require('express');
const router = express.Router();
const podcastController = require('../../controllers/podcastController');
const userPodcastController = require('../../controllers/userPodcastController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');
// Import du nouveau middleware
const uploadHandler = require('../../middlewares/basic_upload');

// Routes utilisateur (inchangées)
router.get('/user/popular', userPodcastController.getPopularPodcasts);
router.get('/user/seasons', userPodcastController.getAvailableSeasons);
router.get('/user/categories', userPodcastController.getAvailableCategories);
router.get('/user/category/:category', userPodcastController.getPodcastsByCategory);
router.get('/user/season/:season', userPodcastController.getPodcastsBySeason);
router.get('/user', userPodcastController.getUserPodcasts);
router.post('/user/playlists', protect, userPodcastController.createPlaylist);
router.get('/user/playlists', protect, userPodcastController.getUserPlaylists);
router.get('/user/:podcastId/memories', userPodcastController.getPodcastMemories);
router.post('/user/:podcastId/like', protect, userPodcastController.likePodcast);
router.post('/user/:podcastId/bookmark', protect, userPodcastController.bookmarkPodcast);
router.post('/user/:podcastId/memory', protect, userPodcastController.addPodcastMemory);
router.post('/user/:podcastId/share', protect, userPodcastController.sharePodcast);
router.post('/user/:podcastId/playlist', protect, userPodcastController.addPodcastToPlaylist);
router.get('/user/:podcastId', userPodcastController.getUserPodcastById);

// Routes admin avec nouveau middleware
router.get('/admin/stats', protect, isAdmin, podcastController.getPodcastStats);
router.get('/admin/all', protect, isAdmin, podcastController.getAllPodcastsAdmin);

// CRUD - nouvelle configuration
router.post('/', 
  protect, 
  isAdmin, 
  uploadHandler.upload,
  uploadHandler.handleError,
  uploadHandler.processVideo,
  podcastController.createPodcast
);

router.put('/:id', 
  protect, 
  isAdmin, 
  uploadHandler.upload,
  uploadHandler.handleError,
  uploadHandler.processVideo,
  podcastController.updatePodcast
);

router.delete('/:id', protect, isAdmin, podcastController.deletePodcast);

// Routes publiques
router.get('/:id', podcastController.getPodcastById);
router.get('/', podcastController.getAllPodcasts);

module.exports = router;