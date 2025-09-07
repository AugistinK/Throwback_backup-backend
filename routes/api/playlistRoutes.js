// routes/api/playlistRoutes.js
const express = require('express');
const router = express.Router();

const playlistController = require('../../controllers/userPlaylistController');
const { protect } = require('../../middlewares/authMiddleware');

// (facultatif) utilisé par /stats ci-dessous
const Playlist = require('../../models/Playlist');

/**
 * ROUTES PUBLIQUES
 * ------------------------------------------------------------------ */

// Playlists populaires (publiques)
router.get('/popular', playlistController.getPopularPlaylists);

// Racine "/api/playlists"
// - si req.user est présent (grâce à extractUser dans index.js) => playlists de l'user
// - sinon => playlists publiques populaires
router.get('/', async (req, res, next) => {
  try {
    if (req.user) {
      return playlistController.getUserPlaylists(req, res, next);
    }
    return playlistController.getPopularPlaylists(req, res, next);
  } catch (e) {
    next(e);
  }
});

// Petite route de stats (optionnelle) pour éviter un 404 si tu l’indexes quelque part
router.get('/stats', async (req, res) => {
  try {
    const [total, publiques, privees, amis] = await Promise.all([
      Playlist.countDocuments(),
      Playlist.countDocuments({ visibilite: 'PUBLIC' }),
      Playlist.countDocuments({ visibilite: 'PRIVE' }),
      Playlist.countDocuments({ visibilite: 'AMIS' })
    ]);

    res.json({
      success: true,
      data: { total, publiques, privees, amis }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats playlists', error: error.message });
  }
});

/**
 * ROUTES PROTÉGÉES
 * ------------------------------------------------------------------ */

// Créer une playlist
router.post('/', protect, playlistController.createPlaylist);

// Playlists de l’utilisateur connecté
router.get('/user', protect, playlistController.getUserPlaylists);

// Détail d’une playlist (public/privé/amis géré dans le contrôleur)
router.get('/:id', playlistController.getPlaylistById);

// Mettre à jour une playlist
router.put('/:id', protect, playlistController.updatePlaylist);

// Supprimer une playlist
router.delete('/:id', protect, playlistController.deletePlaylist);

// Ajouter / retirer des favoris
router.post('/:id/favorite', protect, playlistController.toggleFavorite);

// Partage (si tu as une implémentation dans le contrôleur)
router.post('/:id/share', protect, playlistController.sharePlaylist);

// Incrémenter le nombre de vues
router.post('/:id/view', playlistController.incrementPlaylistViews);

// Route supplémentaire pour les likes (alias de favorite)
router.post('/:id/like', protect, playlistController.toggleLike);

// Gérer les vidéos d’une playlist
router.post('/:id/videos', protect, playlistController.addVideoToPlaylist);
router.delete('/:id/videos/:videoId', protect, playlistController.removeVideoFromPlaylist);

// Réorganiser l’ordre des vidéos
router.put('/:id/reorder', protect, playlistController.reorderPlaylist);

module.exports = router;
