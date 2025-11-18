// routes/api/conversations.js - NOUVELLES ROUTES
const express = require('express');
const router = express.Router();
const conversationsController = require('../../controllers/conversationsController');
const { protect } = require('../../middlewares/authMiddleware');

/**
 * @route   GET /api/conversations
 * @desc    Récupérer toutes les conversations de l'utilisateur
 * @access  Private
 */
router.get('/', protect, conversationsController.getConversations);

/**
 * @route   POST /api/conversations/direct
 * @desc    Récupérer ou créer une conversation directe
 * @access  Private
 */
router.post('/direct', protect, conversationsController.getOrCreateDirectConversation);

/**
 * @route   POST /api/conversations/groups
 * @desc    Créer un nouveau groupe
 * @access  Private
 */
router.post('/groups', protect, conversationsController.createGroup);

/**
 * @route   PUT /api/conversations/groups/:groupId
 * @desc    Mettre à jour un groupe
 * @access  Private
 */
router.put('/groups/:groupId', protect, conversationsController.updateGroup);

/**
 * @route   POST /api/conversations/groups/:groupId/participants
 * @desc    Ajouter un participant à un groupe
 * @access  Private
 */
router.post(
  '/groups/:groupId/participants',
  protect,
  conversationsController.addParticipantToGroup
);

/**
 * @route   DELETE /api/conversations/groups/:groupId/participants/:participantId
 * @desc    Retirer un participant d'un groupe
 * @access  Private
 */
router.delete(
  '/groups/:groupId/participants/:participantId',
  protect,
  conversationsController.removeParticipantFromGroup
);

/**
 * @route   PUT /api/conversations/:conversationId/archive
 * @desc    Archiver une conversation
 * @access  Private
 */
router.put(
  '/:conversationId/archive',
  protect,
  conversationsController.archiveConversation
);

/**
 * @route   PUT /api/conversations/:conversationId/unarchive
 * @desc    Désarchiver une conversation
 * @access  Private
 */
router.put('/:conversationId/unarchive', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;

    const Conversation = require('../../models/Conversation');
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    await conversation.unarchive(userId);

    res.status(200).json({
      success: true,
      message: 'Conversation unarchived successfully'
    });
  } catch (error) {
    console.error('Error unarchiving conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du désarchivage'
    });
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/pin
 * @desc    Épingler une conversation
 * @access  Private
 */
router.put('/:conversationId/pin', protect, conversationsController.pinConversation);

/**
 * @route   PUT /api/conversations/:conversationId/unpin
 * @desc    Désépingler une conversation
 * @access  Private
 */
router.put('/:conversationId/unpin', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;

    const Conversation = require('../../models/Conversation');
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    conversation.pinned = conversation.pinned.filter(
      (id) => id.toString() !== userId.toString()
    );
    await conversation.save();

    res.status(200).json({
      success: true,
      message: 'Conversation unpinned successfully'
    });
  } catch (error) {
    console.error('Error unpinning conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du désépinglage'
    });
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/mute
 * @desc    Désactiver les notifications pour une conversation
 * @access  Private
 */
router.put('/:conversationId/mute', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;
    const { duration } = req.body; // duration en heures

    const Conversation = require('../../models/Conversation');
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Retirer l'ancien mute si existe
    conversation.muted = conversation.muted.filter(
      (m) => m.user.toString() !== userId.toString()
    );

    // Ajouter le nouveau mute
    const muteEntry = { user: userId };
    if (duration) {
      muteEntry.until = new Date(Date.now() + duration * 60 * 60 * 1000);
    }
    conversation.muted.push(muteEntry);

    await conversation.save();

    res.status(200).json({
      success: true,
      message: 'Conversation muted successfully'
    });
  } catch (error) {
    console.error('Error muting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la désactivation des notifications'
    });
  }
});

/**
 * @route   PUT /api/conversations/:conversationId/unmute
 * @desc    Réactiver les notifications pour une conversation
 * @access  Private
 */
router.put('/:conversationId/unmute', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;

    const Conversation = require('../../models/Conversation');
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    conversation.muted = conversation.muted.filter(
      (m) => m.user.toString() !== userId.toString()
    );
    await conversation.save();

    res.status(200).json({
      success: true,
      message: 'Conversation unmuted successfully'
    });
  } catch (error) {
    console.error('Error unmuting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la réactivation des notifications'
    });
  }
});

/**
 * @route   GET /api/conversations/groups/:groupId/messages
 * @desc    Récupérer les messages d'un groupe
 * @access  Private
 */
router.get(
  '/groups/:groupId/messages',
  protect,
  conversationsController.getGroupMessages
);

/**
 * @route   POST /api/conversations/groups/:groupId/messages
 * @desc    Envoyer un message dans un groupe
 * @access  Private
 */
router.post(
  '/groups/:groupId/messages',
  protect,
  conversationsController.sendGroupMessage
);

/**
 * @route   DELETE /groups/:groupId
 * @desc    DELETE un message de groupe
 * @access  Private
 */
router.delete(
  '/groups/:groupId',
  protect,
  conversationsController.deleteGroup
);



module.exports = router;
