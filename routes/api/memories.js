// ================================
// routes/api/memories.js
// ================================

const express = require('express');
const router = express.Router();
const memoryController = require('../../controllers/memoryController');
const { protect } = require('../../middlewares/authMiddleware');

// Liste générale (fallback/debug)
router.get('/', memoryController.getAllMemories);

// Interactions souvenirs (commentaire OU réponse = même modèle)
router.post('/:id/like', protect, memoryController.likeMemory);
router.post('/:id/dislike', protect, memoryController.dislikeMemory);
router.delete('/:id', protect, memoryController.deleteMemory);

// Replies
router.get('/:id/replies', memoryController.getMemoryReplies);
router.post('/:id/replies', protect, memoryController.addReply);

// Signalement (maintenant implémenté)
router.post('/:id/report', protect, memoryController.reportMemory);

module.exports = router;


