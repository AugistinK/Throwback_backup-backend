const express = require('express');
const router = express.Router();
const podcastController = require('../../controllers/podcastController');
const userPodcastController = require('../../controllers/userPodcastController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');

// ========= ROUTES UTILISATEUR =========
// IMPORTANT: Les routes spécifiques doivent être définies AVANT les routes avec paramètres

// Routes pour les playlists (AVANT les routes avec :podcastId)
router.post('/user/playlists', protect, userPodcastController.createPlaylist);
router.get('/user/playlists', protect, userPodcastController.getUserPlaylists);

// Routes populaires et métadonnées (AVANT les routes avec :podcastId)
router.get('/user/popular', userPodcastController.getPopularPodcasts);
router.get('/user/seasons', userPodcastController.getAvailableSeasons);
router.get('/user/categories', userPodcastController.getAvailableCategories);
router.get('/user/category/:category', userPodcastController.getPodcastsByCategory);
router.get('/user/season/:season', userPodcastController.getPodcastsBySeason);

// Route principale pour lister les podcasts
router.get('/user', userPodcastController.getUserPodcasts);

// Routes pour un podcast spécifique (APRÈS les routes spécifiques)
router.get('/user/:podcastId/memories', userPodcastController.getPodcastMemories);
router.post('/user/:podcastId/like', protect, userPodcastController.likePodcast);
router.post('/user/:podcastId/bookmark', protect, userPodcastController.bookmarkPodcast);
router.post('/user/:podcastId/memory', protect, userPodcastController.addPodcastMemory);
router.post('/user/:podcastId/share', protect, userPodcastController.sharePodcast);
router.post('/user/:podcastId/playlist', protect, userPodcastController.addPodcastToPlaylist);
router.get('/user/:podcastId', userPodcastController.getUserPodcastById);

// ========= ROUTES ADMIN =========
// Statistiques et liste complète (accès admin)
router.get('/admin/stats', protect, isAdmin, podcastController.getPodcastStats);
router.get('/admin/all', protect, isAdmin, podcastController.getAllPodcastsAdmin);

// Gestion des podcasts (CRUD admin)
router.post('/', protect, isAdmin, podcastController.createPodcast);
router.put('/:id', protect, isAdmin, podcastController.updatePodcast);
router.delete('/:id', protect, isAdmin, podcastController.deletePodcast);

// ========= ROUTES GÉNÉRIQUES =========
// Accès public aux podcasts (pour rétrocompatibilité)
// Ces routes doivent être en DERNIER
router.get('/:id', podcastController.getPodcastById);
router.get('/', podcastController.getAllPodcasts);

module.exports = router;