// routes/api/adminFriendsChatRoutes.js
const express = require('express');
const router = express.Router();

const {
  getOverview,
  getUserSocialSummary,
  listFriendships,
  deleteFriendship,
  listBlockedRelationships,
  listConversations,
  getConversationMessages,
  getDirectMessagesBetweenUsers,
  adminDeleteMessage,
  listReports,
  updateReport
} = require('../../controllers/adminFriendsChatController');

// ✅ Import correct du middleware d'authentification admin
const { protect, isAdmin } = require('../../middlewares/authMiddleware');

// ✅ Toutes ces routes sont protégées & réservées aux admins / superadmins
router.use(protect, isAdmin);

// Vue d'ensemble globale
router.get('/overview', getOverview);

// Résumé d'un utilisateur
router.get('/users/:userId', getUserSocialSummary);

// Relations d’amitié
router.get('/friendships', listFriendships);
router.delete('/friendships/:friendshipId', deleteFriendship);
router.get('/blocks', listBlockedRelationships);

// Conversations & messages
router.get('/conversations', listConversations);
router.get('/conversations/:conversationId/messages', getConversationMessages);
router.get('/direct-messages', getDirectMessagesBetweenUsers);
router.delete('/messages/:messageId', adminDeleteMessage);

// Reports / signalements
router.get('/reports', listReports);
router.put('/reports/:reportId', updateReport);

module.exports = router;
