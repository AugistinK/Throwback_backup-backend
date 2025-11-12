// controllers/chatActionsController.js 
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const Report = require('../models/Report');
const mongoose = require('mongoose');

/**
 * @desc    Archiver une conversation
 * @route   PUT /api/chat/:conversationId/archive
 * @access  Private
 */
exports.archiveChat = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;

    // Trouver la conversation
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Ajouter l'utilisateur à la liste des archivés
    if (!conversation.archivedBy.includes(userId)) {
      conversation.archivedBy.push(userId);
      await conversation.save();
    }

    // Log action
    await LogAction.create({
      type_action: 'CHAT_ARCHIVED',
      description_action: `Archived conversation ${conversationId}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });

    res.status(200).json({
      success: true,
      message: 'Conversation archived successfully'
    });
  } catch (error) {
    console.error('Error archiving chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error archiving conversation'
    });
  }
};

/**
 * @desc    Désarchiver une conversation
 * @route   PUT /api/chat/:conversationId/unarchive
 * @access  Private
 */
exports.unarchiveChat = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Retirer l'utilisateur de la liste des archivés
    conversation.archivedBy = conversation.archivedBy.filter(
      id => id.toString() !== userId
    );
    await conversation.save();

    res.status(200).json({
      success: true,
      message: 'Conversation unarchived successfully'
    });
  } catch (error) {
    console.error('Error unarchiving chat:', error);
    res.status(500).json({
      success: false,
      message: 'Error unarchiving conversation'
    });
  }
};

/**
 * @desc    Effacer l'historique d'une conversation
 * @route   DELETE /api/chat/:friendId/history
 * @access  Private
 */
exports.clearChatHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.params;

    // Vérifier que les utilisateurs sont amis
    const areFriends = await Friendship.areFriends(userId, friendId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only clear chat history with friends'
      });
    }

    // Soft delete: marquer tous les messages comme supprimés pour cet utilisateur
    const result = await Message.updateMany(
      {
        $or: [
          { sender: userId, receiver: friendId },
          { sender: friendId, receiver: userId }
        ],
        deleted: false
      },
      {
        $addToSet: { deletedBy: userId }
      }
    );

    // Si les deux utilisateurs ont supprimé, marquer comme complètement supprimé
    await Message.updateMany(
      {
        $or: [
          { sender: userId, receiver: friendId },
          { sender: friendId, receiver: userId }
        ],
        deleted: false,
        deletedBy: { $size: 2 }
      },
      {
        deleted: true
      }
    );

    // Log action
    await LogAction.create({
      type_action: 'CHAT_HISTORY_CLEARED',
      description_action: `Cleared chat history with user ${friendId}`,
      id_user: userId,
      created_by: 'SYSTEM',
      donnees_supplementaires: {
        friendId,
        messagesAffected: result.modifiedCount
      }
    });

    res.status(200).json({
      success: true,
      message: 'Chat history cleared successfully',
      data: {
        messagesCleared: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing chat history'
    });
  }
};

/**
 * @desc    Signaler un utilisateur
 * @route   POST /api/chat/report
 * @access  Private
 */
exports.reportUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { reportedUserId, reason, description, messageId } = req.body;

    if (!reportedUserId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Reported user ID and reason are required'
      });
    }

    // Vérifier que l'utilisateur signalé existe
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: 'Reported user not found'
      });
    }

    // Créer le signalement
    const report = await Report.create({
      reporter: userId,
      reportedUser: reportedUserId,
      reason,
      description: description || '',
      messageId: messageId || null,
      status: 'pending',
      created_by: userId
    });

    // Log action
    await LogAction.create({
      type_action: 'USER_REPORTED',
      description_action: `Reported user ${reportedUserId} for ${reason}`,
      id_user: userId,
      created_by: 'SYSTEM',
      donnees_supplementaires: {
        reportedUserId,
        reason,
        reportId: report._id
      }
    });

    res.status(201).json({
      success: true,
      message: 'User reported successfully. Our team will review it.',
      data: {
        reportId: report._id
      }
    });
  } catch (error) {
    console.error('Error reporting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error reporting user'
    });
  }
};

/**
 * @desc    Retirer un ami
 * @route   DELETE /api/chat/friend/:friendId
 * @access  Private
 */
exports.removeFriend = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.params;

    // Vérifier que l'amitié existe
    const friendship = await Friendship.findOne({
      $or: [
        { requester: userId, recipient: friendId, status: 'accepted' },
        { requester: friendId, recipient: userId, status: 'accepted' }
      ]
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    // Supprimer l'amitié
    await friendship.deleteOne();

    // Archiver automatiquement toutes les conversations
    const conversations = await Conversation.find({
      participants: { $all: [userId, friendId] }
    });

    for (const conv of conversations) {
      if (!conv.archivedBy.includes(userId)) {
        conv.archivedBy.push(userId);
        await conv.save();
      }
    }

    // Log action
    await LogAction.create({
      type_action: 'FRIEND_REMOVED',
      description_action: `Removed friend ${friendId}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });

    // Notifier via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(friendId).emit('friend-removed', {
        userId,
        message: 'A user has removed you from their friends'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Friend removed successfully'
    });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing friend'
    });
  }
};

/**
 * @desc    Modifier un message
 * @route   PUT /api/chat/messages/:messageId
 * @access  Private
 */
exports.editMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      sender: userId,
      deleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not the sender'
      });
    }

    // Sauvegarder l'ancien contenu dans l'historique
    if (!message.editHistory) {
      message.editHistory = [];
    }
    message.editHistory.push({
      content: message.content,
      editedAt: new Date()
    });

    message.content = content.trim();
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender receiver', 'nom prenom photo_profil');

    // Notifier via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(message.receiver.toString()).emit('message-edited', {
        messageId: message._id,
        content: message.content,
        edited: true,
        editedAt: message.editedAt
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message edited successfully',
      data: message
    });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({
      success: false,
      message: 'Error editing message'
    });
  }
};

/**
 * @desc    Copier un message
 * @route   POST /api/chat/messages/:messageId/copy
 * @access  Private
 */
exports.copyMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      $or: [
        { sender: userId },
        { receiver: userId }
      ],
      deleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        content: message.content,
        type: message.type
      }
    });
  } catch (error) {
    console.error('Error copying message:', error);
    res.status(500).json({
      success: false,
      message: 'Error copying message'
    });
  }
};

/**
 * @desc    Supprimer un message
 * @route   DELETE /api/chat/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    const { deleteForEveryone } = req.body;

    const message = await Message.findOne({
      _id: messageId,
      deleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Vérifier les permissions
    const isSender = message.sender.toString() === userId;
    const isReceiver = message.receiver.toString() === userId;

    if (!isSender && !isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (deleteForEveryone) {
      // Supprimer pour tout le monde (seulement si l'utilisateur est le sender)
      if (!isSender) {
        return res.status(403).json({
          success: false,
          message: 'Only the sender can delete for everyone'
        });
      }

      // Vérifier le délai (ex: max 1 heure après l'envoi)
      const hoursSinceCreation = (Date.now() - message.created_date) / (1000 * 60 * 60);
      if (hoursSinceCreation > 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete for everyone after 1 hour'
        });
      }

      message.deleted = true;
      message.deletedBy = [message.sender, message.receiver];
      message.deletedForEveryone = true;
      await message.save();

      // Notifier via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(message.receiver.toString()).emit('message-deleted', {
          messageId: message._id,
          deletedForEveryone: true
        });
      }
    } else {
      // Supprimer seulement pour l'utilisateur actuel
      if (!message.deletedBy.includes(userId)) {
        message.deletedBy.push(userId);
      }

      // Si les deux ont supprimé, marquer comme complètement supprimé
      if (message.deletedBy.length === 2) {
        message.deleted = true;
      }

      await message.save();
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting message'
    });
  }
};

/**
 * @desc    Transférer un message
 * @route   POST /api/chat/messages/:messageId/forward
 * @access  Private
 */
exports.forwardMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    const { recipientIds } = req.body;

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one recipient is required'
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      $or: [
        { sender: userId },
        { receiver: userId }
      ],
      deleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Vérifier que tous les destinataires sont des amis
    const friendChecks = await Promise.all(
      recipientIds.map(recId => Friendship.areFriends(userId, recId))
    );

    if (friendChecks.some(check => !check)) {
      return res.status(403).json({
        success: false,
        message: 'You can only forward messages to friends'
      });
    }

    // Créer les messages transférés
    const forwardedMessages = await Promise.all(
      recipientIds.map(recipientId =>
        Message.create({
          sender: userId,
          receiver: recipientId,
          content: message.content,
          type: message.type,
          forwarded: true,
          forwardedFrom: message.sender,
          created_by: userId
        })
      )
    );

    // Populer les messages
    await Message.populate(forwardedMessages, {
      path: 'sender receiver forwardedFrom',
      select: 'nom prenom photo_profil'
    });

    // Notifier via Socket.IO
    const io = req.app.get('io');
    if (io) {
      forwardedMessages.forEach(msg => {
        io.to(msg.receiver._id.toString()).emit('new-message', {
          message: msg
        });
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message forwarded successfully',
      data: {
        forwardedCount: forwardedMessages.length
      }
    });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({
      success: false,
      message: 'Error forwarding message'
    });
  }
};

/**
 * @desc    Répondre à un message
 * @route   POST /api/chat/messages/:messageId/reply
 * @access  Private
 */
exports.replyToMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const originalMessage = await Message.findOne({
      _id: messageId,
      $or: [
        { sender: userId },
        { receiver: userId }
      ],
      deleted: false
    }).populate('sender receiver', 'nom prenom photo_profil');

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Original message not found'
      });
    }

    // Déterminer le destinataire (l'autre personne dans la conversation)
    const receiverId = originalMessage.sender._id.toString() === userId
      ? originalMessage.receiver._id
      : originalMessage.sender._id;

    // Créer le message de réponse
    const replyMessage = await Message.create({
      sender: userId,
      receiver: receiverId,
      content: content.trim(),
      type: 'text',
      replyTo: messageId,
      created_by: userId
    });

    await replyMessage.populate('sender receiver replyTo', 'nom prenom photo_profil content');

    // Notifier via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(receiverId.toString()).emit('new-message', {
        message: replyMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      data: replyMessage
    });
  } catch (error) {
    console.error('Error replying to message:', error);
    res.status(500).json({
      success: false,
      message: 'Error replying to message'
    });
  }
};

module.exports = exports;