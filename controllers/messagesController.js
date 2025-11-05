// controllers/messagesController.js
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer les conversations de l'utilisateur
 * @route   GET /api/messages/conversations
 * @access  Private
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const conversations = await Message.getConversations(userId);
    
    res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations'
    });
  }
};

/**
 * @desc    Récupérer les messages d'une conversation
 * @route   GET /api/messages/:friendId
 * @access  Private
 */
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Vérifier si les utilisateurs sont amis
    const areFriends = await Friendship.areFriends(userId, friendId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only message your friends'
      });
    }
    
    const total = await Message.countDocuments({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ],
      deleted: false
    });
    
    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ],
      deleted: false
    })
    .sort({ created_date: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender receiver', 'nom prenom photo_profil');
    
    // Marquer les messages reçus comme lus
    await Message.updateMany(
      {
        sender: friendId,
        receiver: userId,
        read: false
      },
      {
        read: true,
        readAt: new Date()
      }
    );
    
    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // Ordre chronologique
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error in getMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des messages'
    });
  }
};

/**
 * @desc    Envoyer un message
 * @route   POST /api/messages
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { receiverId, content, type } = req.body;
    
    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID and content are required'
      });
    }
    
    // Vérifier si les utilisateurs sont amis
    const areFriends = await Friendship.areFriends(userId, receiverId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only message your friends'
      });
    }
    
    const message = await Message.create({
      sender: userId,
      receiver: receiverId,
      content,
      type: type || 'text',
      created_by: userId
    });
    
    await message.populate('sender receiver', 'nom prenom photo_profil');
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi du message'
    });
  }
};

/**
 * @desc    Marquer un message comme lu
 * @route   PUT /api/messages/:messageId/read
 * @access  Private
 */
exports.markMessageAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    
    const message = await Message.findOne({
      _id: messageId,
      receiver: userId
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    await message.markAsRead();
    
    res.status(200).json({
      success: true,
      message: 'Message marked as read',
      data: message
    });
  } catch (error) {
    console.error('Error in markMessageAsRead:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage du message'
    });
  }
};

/**
 * @desc    Supprimer un message
 * @route   DELETE /api/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { messageId } = req.params;
    
    const message = await Message.findOne({
      _id: messageId,
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Soft delete - marquer comme supprimé par cet utilisateur
    if (!message.deletedBy.includes(userId)) {
      message.deletedBy.push(userId);
    }
    
    // Si les deux utilisateurs ont supprimé, marquer comme complètement supprimé
    if (message.deletedBy.length === 2) {
      message.deleted = true;
    }
    
    await message.save();
    
    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteMessage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du message'
    });
  }
};

/**
 * @desc    Récupérer le nombre de messages non lus
 * @route   GET /api/messages/unread/count
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const count = await Message.countDocuments({
      receiver: userId,
      read: false,
      deleted: false
    });
    
    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du nombre de messages non lus'
    });
  }
};

module.exports = exports;