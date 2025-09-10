// routes/api/comments.js
const express = require('express');
const router = express.Router();
const commentController = require('../../controllers/commentController');
const { protect } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');

// Routes pour les commentaires
router.get('/:commentId/replies', optionalAuth, commentController.getCommentReplies);
router.post('/:id/like', protect, logAction('LIKE_COMMENTAIRE', 'Like d\'un commentaire'), commentController.likeComment);
router.post('/:id/dislike', protect, logAction('DISLIKE_COMMENTAIRE', 'Dislike d\'un commentaire'), commentController.dislikeComment);
router.delete('/:id', protect, logAction('SUPPRESSION_COMMENTAIRE', 'Suppression d\'un commentaire'), commentController.deleteComment);
router.put('/:id', protect, logAction('MODIFICATION_COMMENTAIRE', 'Modification d\'un commentaire'), commentController.updateComment);
router.post('/:id/report', protect, logAction('SIGNALEMENT_COMMENTAIRE', 'Signalement d\'un commentaire'), commentController.reportComment);

module.exports = router;