// routes/search.js
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/searchController');

// Limiteur léger pour l’autocomplétion (éviter le spam)
const suggestionsLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20,             
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Routes PUBLIC (ne PAS mettre de middleware d'auth ici) ---

// Recherche globale
// GET /api/search?query=...&page=1&limit=10&type=all|videos|playlists|podcasts|livestreams
router.get('/search', ctrl.globalSearch);

// Vidéos
// GET /api/search/videos?query=...&page=1&limit=12&genre=&decennie=&sort=relevance|newest|views
router.get('/search/videos', ctrl.searchVideos);

// Playlists
// GET /api/search/playlists?query=...&page=1&limit=12&sort=popularity|newest
router.get('/search/playlists', ctrl.searchPlaylists);

// Podcasts
// GET /api/search/podcasts?query=...&page=1&limit=12&category=&sort=newest|popular
router.get('/search/podcasts', ctrl.searchPodcasts);

// Livestreams
// GET /api/search/livestreams?query=...&page=1&limit=12&status=all|upcoming|live|ended&category=
router.get('/search/livestreams', ctrl.searchLivestreams);

// Suggestions (autocomplete)
// GET /api/search/suggestions?query=..&limit=8
router.get('/search/suggestions', suggestionsLimiter, ctrl.getSearchSuggestions);

module.exports = router;
