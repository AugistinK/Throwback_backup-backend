// routes/api/wallRoutes.js
const router = require('express').Router();
const { protect } = require('../middlewares/auth'); // ou ton protect déjà déclaré
const optionalAuth = require('../middlewares/optionalAuth');
const { wallUpload } = require('../middlewares/wallUpload');
const { logAction } = require('../middlewares/logAction');
const ctrl = require('../../controllers/wallController');

// Feed public (auth optionnelle = meilleur ranking perso plus tard)
router.get('/feed', optionalAuth, ctrl.getFeed);

// Détail
router.get('/posts/:id', optionalAuth, ctrl.getById);

// Création d’un post
router.post(
  '/posts',
  protect,                      // basé sur ton JWT (:contentReference[oaicite:1]{index=1})
  wallUpload,
  logAction('WALL_CREATE','Création de post ThrowBack Wall'),
  ctrl.createPost
);

// Réaction & commentaire
router.post('/posts/:id/react', protect, logAction('WALL_REACT','Réaction post'), ctrl.react);
router.post('/posts/:id/comments', protect, logAction('WALL_COMMENT','Commentaire post'), ctrl.comment);

module.exports = router;
