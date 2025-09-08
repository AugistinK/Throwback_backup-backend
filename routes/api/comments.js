// routes/api/comments.js
const express = require('express');
const router = express.Router();
const commentController = require('../../controllers/commentController');
const { protect } = require('../../middlewares/authMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');

// Attention: utilisez getCommentReplies, pas getReplies
router.get('/:commentId/replies', optionalAuth, commentController.getCommentReplies);
router.put('/:commentId', protect, commentController.updateComment);
router.delete('/:commentId', protect, commentController.deleteComment);
router.post('/:commentId/like', protect, commentController.likeComment);
router.post('/:commentId/dislike', protect, commentController.dislikeComment);
router.post('/:commentId/report', protect, commentController.reportComment);

module.exports = router;