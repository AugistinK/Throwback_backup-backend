// routes/api/adminPostRoutes.js
const express = require('express');
const router = express.Router();
const adminPostController = require('../../controllers/adminPostController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');

// Appliquer les middlewares d'authentification et d'autorisation à toutes les routes
router.use(protect);
router.use(isAdmin);

// Routes pour la gestion des posts
router.get('/', adminPostController.getAllPosts);
router.get('/stats', adminPostController.getModerationStats);
router.get('/:id', adminPostController.getPostById);
router.put('/:id/moderate', adminPostController.moderatePost);
router.put('/:id/restore', adminPostController.restorePost);
router.delete('/:id', adminPostController.deletePost);

// Routes pour la gestion des commentaires
router.get('/:id/comments', adminPostController.getPostComments);
router.delete('/:id/comments/:commentId', adminPostController.deleteComment);

module.exports = router;