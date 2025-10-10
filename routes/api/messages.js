// routes/api/messages.js
const express = require('express');
const router = express.Router();
const messagesController = require('../../controllers/messagesController');
const { protect } = require('../../middlewares/authMiddleware');

/**
 * @route   GET /api/messages/conversations
 * @desc    Récupérer toutes les conversations
 * @access  Private
 */
router.get('/conversations', protect, messagesController.getConversations);

/**
 * @route   GET /api/messages/unread/count
 * @desc    Récupérer le nombre de messages non lus
 * @access  Private
 */
router.get('/unread/count', protect, messagesController.getUnreadCount);

/**
 * @route   GET /api/messages/:friendId
 * @desc    Récupérer les messages d'une conversation
 * @access  Private
 */
router.get('/:friendId', protect, messagesController.getMessages);

/**
 * @route   POST /api/messages
 * @desc    Envoyer un message
 * @access  Private
 */
router.post('/', protect, messagesController.sendMessage);

/**
 * @route   PUT /api/messages/:messageId/read
 * @desc    Marquer un message comme lu
 * @access  Private
 */
router.put('/:messageId/read', protect, messagesController.markMessageAsRead);

/**
 * @route   DELETE /api/messages/:messageId
 * @desc    Supprimer un message
 * @access  Private
 */
router.delete('/:messageId', protect, messagesController.deleteMessage);

module.exports = router;