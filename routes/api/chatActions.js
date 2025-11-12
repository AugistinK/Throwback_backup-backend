// routes/api/chatActions.js - Routes pour les actions de chat avancées
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const chatActionsController = require('../../controllers/chatActionsController');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   PUT /api/chat/:conversationId/archive
 * @desc    Archiver une conversation
 * @access  Private
 */
router.put(
  '/:conversationId/archive',
  protect,
  logAction('CHAT_ARCHIVED', 'Archived conversation'),
  chatActionsController.archiveChat
);

/**
 * @route   PUT /api/chat/:conversationId/unarchive
 * @desc    Désarchiver une conversation
 * @access  Private
 */
router.put(
  '/:conversationId/unarchive',
  protect,
  chatActionsController.unarchiveChat
);

/**
 * @route   DELETE /api/chat/:friendId/history
 * @desc    Effacer l'historique d'une conversation
 * @access  Private
 */
router.delete(
  '/:friendId/history',
  protect,
  logAction('CHAT_HISTORY_CLEARED', 'Cleared chat history'),
  chatActionsController.clearChatHistory
);

/**
 * @route   POST /api/chat/report
 * @desc    Signaler un utilisateur
 * @access  Private
 */
router.post(
  '/report',
  protect,
  logAction('USER_REPORTED', 'Reported user'),
  chatActionsController.reportUser
);

/**
 * @route   DELETE /api/chat/friend/:friendId
 * @desc    Retirer un ami
 * @access  Private
 */
router.delete(
  '/friend/:friendId',
  protect,
  logAction('FRIEND_REMOVED', 'Removed friend'),
  chatActionsController.removeFriend
);

/**
 * @route   PUT /api/chat/messages/:messageId
 * @desc    Modifier un message
 * @access  Private
 */
router.put(
  '/messages/:messageId',
  protect,
  logAction('MESSAGE_EDITED', 'Edited message'),
  chatActionsController.editMessage
);

/**
 * @route   POST /api/chat/messages/:messageId/copy
 * @desc    Copier un message
 * @access  Private
 */
router.post(
  '/messages/:messageId/copy',
  protect,
  chatActionsController.copyMessage
);

/**
 * @route   DELETE /api/chat/messages/:messageId
 * @desc    Supprimer un message
 * @access  Private
 */
router.delete(
  '/messages/:messageId',
  protect,
  logAction('MESSAGE_DELETED', 'Deleted message'),
  chatActionsController.deleteMessage
);

/**
 * @route   POST /api/chat/messages/:messageId/forward
 * @desc    Transférer un message
 * @access  Private
 */
router.post(
  '/messages/:messageId/forward',
  protect,
  logAction('MESSAGE_FORWARDED', 'Forwarded message'),
  chatActionsController.forwardMessage
);

/**
 * @route   POST /api/chat/messages/:messageId/reply
 * @desc    Répondre à un message
 * @access  Private
 */
router.post(
  '/messages/:messageId/reply',
  protect,
  chatActionsController.replyToMessage
);

module.exports = router;