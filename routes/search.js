// routes/search.js
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { query, validationResult } = require('express-validator');
const ctrl = require('../controllers/searchController');

/* ------------------------------------------------------------------ */
/* Middlewares utilitaires                                             */
/* ------------------------------------------------------------------ */

// Limiteur léger pour l’endpoint d’autocomplétion (évite le spam, reste permissif)
const suggestionsLimiter = rateLimit({
  windowMs: 10 * 1000, 
  max: 20,             
  standardHeaders: true,
  legacyHeaders: false
});

// Helper de validation (retourne 400 si invalide)
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    message: 'Paramètres de requête invalides',
    errors: errors.array()
  });
};

/* ------------------------------------------------------------------ */
/* Routes de recherche (Publiques)                                     */
/* ------------------------------------------------------------------ */

/**
 * Recherche globale
 * GET /api/search?query=...&page=1&limit=10&type=all|videos|playlists|podcasts|livestreams
 */
router.get(
  '/search',
  [
    query('query').optional().trim().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('type').optional().isIn(['all', 'videos', 'playlists', 'podcasts', 'livestreams'])
  ],
  handleValidation,
  ctrl.globalSearch
);

/**
 * Recherche vidéos
 * GET /api/search/videos?query=...&page=1&limit=12&genre=&decennie=&sort=relevance|newest|views
 */
router.get(
  '/search/videos',
  [
    query('query').optional().trim().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('genre').optional().trim().isString(),
    query('decennie').optional().trim().isString(),
    query('sort').optional().isIn(['relevance', 'newest', 'views'])
  ],
  handleValidation,
  ctrl.searchVideos
);

/**
 * Recherche playlists
 * GET /api/search/playlists?query=...&page=1&limit=12&sort=popularity|newest
 */
router.get(
  '/search/playlists',
  [
    query('query').optional().trim().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('sort').optional().isIn(['popularity', 'newest'])
  ],
  handleValidation,
  ctrl.searchPlaylists
);

/**
 * Recherche podcasts
 * GET /api/search/podcasts?query=...&page=1&limit=12&category=&sort=newest|popular
 */
router.get(
  '/search/podcasts',
  [
    query('query').optional().trim().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('category').optional().trim().isString(),
    query('sort').optional().isIn(['newest', 'popular'])
  ],
  handleValidation,
  ctrl.searchPodcasts
);

/**
 * Recherche livestreams
 * GET /api/search/livestreams?query=...&page=1&limit=12&status=all|upcoming|live|ended&category=
 */
router.get(
  '/search/livestreams',
  [
    query('query').optional().trim().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('status').optional().isIn(['all', 'upcoming', 'live', 'ended']),
    query('category').optional().trim().isString()
  ],
  handleValidation,
  ctrl.searchLivestreams
);

/**
 * Suggestions (autocomplete) — PUBLIC
 * GET /api/search/suggestions?query=..&limit=8
 * Note : le contrôleur caste et borne déjà "limit" ; ici on ajoute un garde-fou + rate-limit.
 */
router.get(
  '/search/suggestions',
  suggestionsLimiter,
  [
    query('query').exists().withMessage('query est requis').trim().isString(),
    query('limit').optional().isInt({ min: 1, max: 20 }).toInt()
  ],
  handleValidation,
  ctrl.getSearchSuggestions
);

module.exports = router;
