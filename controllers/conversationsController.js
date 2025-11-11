// controllers/conversationsController.js - NOUVEAU CONTRÔLEUR
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer toutes les conversations de l'utilisateur
 * @route   GET /api/conversations
 * @access  Private
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Récupérer les conversations où l'utilisateur est participant
    const conversations = await Conversation.find({
      participants: userObjectId,
      archivedBy: { $ne: userObjectId }
    })
    .populate('participants', 'nom prenom email photo_profil')
    .populate('lastMessage')
    .populate('groupCreator groupAdmins', 'nom prenom')
    .sort({ lastMessageAt: -1 });
    
    // Pour chaque conversation, calculer le nombre de messages non lus
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          receiver: userObjectId,
          read: false,
          deleted: false
        });
        
        return {
          _id: conv._id,
          type: conv.type,
          participants: conv.participants,
          groupName: conv.groupName,
          groupDescription: conv.groupDescription,
          groupAvatar: conv.groupAvatar,
          groupCreator: conv.groupCreator,
          groupAdmins: conv.groupAdmins,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount,
          isPinned: conv.pinned.includes(userObjectId),
          isMuted: conv.muted.some(m => m.user.toString() === userId)
        };
      })
    );
    
    res.status(200).json({
      success: true,
      data: conversationsWithUnread
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
 * @desc    Récupérer ou créer une conversation directe
 * @route   POST /api/conversations/direct
 * @access  Private
 */
exports.getOrCreateDirectConversation = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.body;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }
    
    // Vérifier si les utilisateurs sont amis
    const areFriends = await Friendship.areFriends(userId, friendId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only message your friends'
      });
    }
    
    const conversation = await Conversation.getOrCreateDirectConversation(userId, friendId);
    
    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Error in getOrCreateDirectConversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la conversation'
    });
  }
};

/**
 * @desc    Créer un groupe
 * @route   POST /api/conversations/groups
 * @access  Private
 */
exports.createGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, participants, description } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }
    
    if (!participants || participants.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 participants are required'
      });
    }
    
    // Vérifier que tous les participants sont amis avec le créateur
    const friendships = await Promise.all(
      participants.map(p => Friendship.areFriends(userId, p))
    );
    
    if (friendships.some(f => !f)) {
      return res.status(403).json({
        success: false,
        message: 'You can only add friends to groups'
      });
    }
    
    const group = await Conversation.createGroup(
      userId,
      name.trim(),
      participants,
      description
    );
    
    // Log action
    await LogAction.create({
      type_action: 'GROUP_CREATED',
      description_action: `Created group: ${name}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    // Émettre événement Socket.IO à tous les participants
    const io = req.app.get('io');
    participants.forEach(participantId => {
      io.to(participantId).emit('group-created', {
        group,
        createdBy: userId
      });
    });
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in createGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du groupe'
    });
  }
};

/**
 * @desc    Mettre à jour un groupe
 * @route   PUT /api/conversations/groups/:groupId
 * @access  Private
 */
exports.updateGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { name, description, avatar } = req.body;
    
    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Vérifier que l'utilisateur est admin
    if (!conversation.groupAdmins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update group'
      });
    }
    
    if (name) conversation.groupName = name.trim();
    if (description !== undefined) conversation.groupDescription = description;
    if (avatar) conversation.groupAvatar = avatar;
    conversation.modified_date = Date.now();
    
    await conversation.save();
    await conversation.populate('participants groupCreator groupAdmins');
    
    // Notifier tous les participants
    const io = req.app.get('io');
    conversation.participants.forEach(p => {
      io.to(p._id.toString()).emit('group-updated', {
        group: conversation
      });
    });
    
    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Error in updateGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du groupe'
    });
  }
};

/**
 * @desc    Ajouter un participant à un groupe
 * @route   POST /api/conversations/groups/:groupId/participants
 * @access  Private
 */
exports.addParticipantToGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { participantId } = req.body;
    
    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Vérifier que l'utilisateur est admin
    if (!conversation.groupAdmins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add participants'
      });
    }
    
    // Vérifier que le participant est ami avec l'admin
    const areFriends = await Friendship.areFriends(userId, participantId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only add friends'
      });
    }
    
    await conversation.addParticipant(participantId, userId);
    await conversation.populate('participants groupAdmins');
    
    // Notifier le nouveau participant
    const io = req.app.get('io');
    io.to(participantId).emit('added-to-group', {
      group: conversation,
      addedBy: userId
    });
    
    res.status(200).json({
      success: true,
      message: 'Participant added successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Error in addParticipantToGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout du participant'
    });
  }
};

/**
 * @desc    Retirer un participant d'un groupe
 * @route   DELETE /api/conversations/groups/:groupId/participants/:participantId
 * @access  Private
 */
exports.removeParticipantFromGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId, participantId } = req.params;
    
    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Vérifier que l'utilisateur est admin ou se retire lui-même
    const isAdmin = conversation.groupAdmins.includes(userId);
    const isSelf = userId === participantId;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove participants'
      });
    }
    
    await conversation.removeParticipant(participantId);
    
    // Notifier le participant retiré
    const io = req.app.get('io');
    io.to(participantId).emit('removed-from-group', {
      groupId,
      removedBy: userId
    });
    
    res.status(200).json({
      success: true,
      message: 'Participant removed successfully'
    });
  } catch (error) {
    console.error('Error in removeParticipantFromGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du retrait du participant'
    });
  }
};

/**
 * @desc    Archiver une conversation
 * @route   PUT /api/conversations/:conversationId/archive
 * @access  Private
 */
exports.archiveConversation = async (req, res) => {
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
    
    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not a participant'
      });
    }
    
    await conversation.archive(userId);
    
    res.status(200).json({
      success: true,
      message: 'Conversation archived successfully'
    });
  } catch (error) {
    console.error('Error in archiveConversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'archivage'
    });
  }
};

/**
 * @desc    Épingler une conversation
 * @route   PUT /api/conversations/:conversationId/pin
 * @access  Private
 */
exports.pinConversation = async (req, res) => {
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
    
    if (!conversation.pinned.includes(userId)) {
      conversation.pinned.push(userId);
      await conversation.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Conversation pinned successfully'
    });
  } catch (error) {
    console.error('Error in pinConversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'épinglage'
    });
  }
};

module.exports = exports;