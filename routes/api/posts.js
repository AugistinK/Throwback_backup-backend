// routes/api/posts.js
const express = require('express');
const router = express.Router();
const postController = require('../../controllers/postController');
const commentController = require('../../controllers/commentController');
const { protect } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');
const uploadMiddleware = require('../../middlewares/upload.middleware');

// Importer le middleware spécifique pour les posts
const postUploadMiddleware = require('../../middlewares/upload.post.middleware');

// Routes pour les posts
router.get('/', optionalAuth, postController.getPosts);

// Utiliser le middleware spécifique pour les posts qui accepte les images
router.post('/', protect, postUploadMiddleware.upload, postUploadMiddleware.handleMulterError, logAction('CREATION_POST', 'Création d\'un post'), postController.createPost);
// router.post('/', protect, uploadPost, logAction('CREATION_POST', 'Création d\'un post'), postController.createPost);
router.get('/:id', optionalAuth, postController.getPostById);
router.put('/:id', protect, logAction('MODIFICATION_POST', 'Modification d\'un post'), postController.updatePost);
router.delete('/:id', protect, logAction('SUPPRESSION_POST', 'Suppression d\'un post'), postController.deletePost);

// Routes pour les interactions avec les posts
router.post('/:id/like', protect, logAction('LIKE_POST', 'Like d\'un post'), postController.likePost);
router.post('/:id/share', protect, logAction('PARTAGE_POST', 'Partage d\'un post'), postController.sharePost);
router.post('/:id/report', protect, logAction('SIGNALEMENT_POST', 'Signalement d\'un post'), postController.reportPost);

// Routes pour les commentaires
router.get('/:postId/comments', optionalAuth, commentController.getPostComments);
router.post('/:postId/comments', protect, logAction('AJOUT_COMMENTAIRE_POST', 'Ajout d\'un commentaire sur un post'), commentController.addPostComment);

module.exports = router;