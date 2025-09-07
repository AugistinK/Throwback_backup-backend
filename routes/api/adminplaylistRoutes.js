// routes/api/adminplaylistRoutes.js
const express = require('express');
const router = express.Router();
const playlistController = require('../../controllers/playlistController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

// Routes admin spécifiques pour les playlists
router.get('/', 
  protect, 
  isAdmin, 
  playlistController.getAllPlaylists
);

router.get('/stats', 
  protect, 
  isAdmin, 
  playlistController.getPlaylistStats
);

router.get('/:id', 
  protect, 
  isAdmin, 
  playlistController.getPlaylistById
);

router.put('/:id', 
  protect, 
  isAdmin, 
  logAction('MODIFICATION_PLAYLIST', 'Modification d\'une playlist par admin'),
  playlistController.updatePlaylist
);

router.delete('/:id', 
  protect, 
  isAdmin,
  logAction('SUPPRESSION_PLAYLIST', 'Suppression d\'une playlist par admin'),
  playlistController.deletePlaylist
);

router.post('/:id/videos', 
  protect, 
  isAdmin,
  logAction('AJOUT_VIDEO_PLAYLIST', 'Ajout d\'une vidéo à une playlist par admin'),
  playlistController.addVideoToPlaylist
);

router.delete('/:id/videos/:videoId', 
  protect, 
  isAdmin,
  logAction('SUPPRESSION_VIDEO_PLAYLIST', 'Suppression d\'une vidéo d\'une playlist par admin'),
  playlistController.removeVideoFromPlaylist
);

router.put('/:id/reorder', 
  protect, 
  isAdmin,
  logAction('REORDONNANCEMENT_PLAYLIST', 'Réorganisation des vidéos d\'une playlist par admin'),
  playlistController.reorderPlaylistVideos
);

router.put('/:id/collaborateurs', 
  protect, 
  isAdmin,
  logAction('GESTION_COLLABORATEURS_PLAYLIST', 'Gestion des collaborateurs d\'une playlist par admin'),
  playlistController.manageCollaborators
);

module.exports = router;