// controllers/groupMessagesController.js - CONTRÔLEUR COMPLET POUR LA MESSAGERIE DE GROUPE
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * @desc    Créer un nouveau groupe
 * @route   POST /api/groups
 * @access  Private
 */
exports.createGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, description, participants } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one participant is required'
      });
    }

    // Valider que tous les participants existent
    const validParticipants = await User.find({
      _id: { $in: participants }
    }).select('_id');

    if (validParticipants.length !== participants.length) {
      return res.status(400).json({
        success: false,
        message: 'Some participants are invalid'
      });
    }

    // Créer le groupe
    const group = await Conversation.createGroup(
      userId,
      name,
      participants,
      description
    );

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: group
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating group'
    });
  }
};

/**
 * @desc    Récupérer les groupes de l'utilisateur
 * @route   GET /api/groups
 * @access  Private
 */
exports.getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const groups = await Conversation.find({
      type: 'group',
      participants: userId
    })
      .populate('participants', 'nom prenom photo_profil')
      .populate('groupCreator', 'nom prenom')
      .populate('groupAdmins', 'nom prenom')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: 'nom prenom photo_profil'
        }
      })
      .sort({ lastMessageAt: -1 });

    res.status(200).json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching groups'
    });
  }
};

/**
 * @desc    Récupérer les détails d'un groupe
 * @route   GET /api/groups/:groupId
 * @access  Private
 */
exports.getGroupDetails = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: userId
    })
      .populate('participants', 'nom prenom email photo_profil')
      .populate('groupCreator', 'nom prenom photo_profil')
      .populate('groupAdmins', 'nom prenom photo_profil');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }

    res.status(200).json({
      success: true,
      data: group
    });
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching group details'
    });
  }
};

/**
 * @desc    Récupérer les messages d'un groupe
 * @route   GET /api/groups/:groupId/messages
 * @access  Private
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    // Vérifier que l'utilisateur est membre du groupe
    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: userId
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Récupérer les messages du groupe
    const total = await Message.countDocuments({
      groupId: groupId,
      deleted: false,
      deletedForEveryone: false
    });

    const messages = await Message.find({
      groupId: groupId,
      deleted: false,
      deletedForEveryone: false
    })
      .sort({ created_date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'nom prenom photo_profil')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'nom prenom'
        }
      });

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
    console.error('Error fetching group messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching group messages'
    });
  }
};

/**
 * @desc    Envoyer un message dans un groupe
 * @route   POST /api/groups/:groupId/messages
 * @access  Private
 */
exports.sendGroupMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { content, type, replyTo } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    // Vérifier que l'utilisateur est membre du groupe
    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: userId
    });

    if (!group) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Créer le message
    const message = await Message.create({
      sender: userId,
      groupId: groupId,
      isGroupMessage: true,
      content: content.trim(),
      type: type || 'text',
      replyTo: replyTo || null,
      created_by: userId
    });

    // Mettre à jour le dernier message du groupe
    group.lastMessage = message._id;
    group.lastMessageAt = new Date();
    await group.save();

    // Peupler les données du message
    await message.populate('sender', 'nom prenom photo_profil');
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'nom prenom'
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message'
    });
  }
};

/**
 * @desc    Ajouter des membres au groupe
 * @route   POST /api/groups/:groupId/members
 * @access  Private
 */
exports.addGroupMembers = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Vérifier que l'utilisateur est admin
    const isAdmin = group.groupAdmins.some(
      (adminId) => adminId.toString() === userId.toString()
    );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add members'
      });
    }

    // Valider les utilisateurs
    const validUsers = await User.find({
      _id: { $in: userIds }
    }).select('_id');

    if (validUsers.length !== userIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some user IDs are invalid'
      });
    }

    // Ajouter les membres
    const addedMembers = [];
    for (const newUserId of userIds) {
      if (!group.participants.includes(newUserId)) {
        await group.addParticipant(newUserId, userId);
        addedMembers.push(newUserId);
      }
    }

    await group.populate('participants', 'nom prenom photo_profil');

    res.status(200).json({
      success: true,
      message: `${addedMembers.length} member(s) added successfully`,
      data: group
    });
  } catch (error) {
    console.error('Error adding group members:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding members'
    });
  }
};

/**
 * @desc    Retirer un membre du groupe
 * @route   DELETE /api/groups/:groupId/members/:memberId
 * @access  Private
 */
exports.removeGroupMember = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId, memberId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group or member ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Vérifier les permissions
    const isAdmin = group.groupAdmins.some(
      (adminId) => adminId.toString() === userId.toString()
    );
    const isCreator = group.groupCreator.toString() === userId.toString();
    const isSelf = memberId === userId.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove members'
      });
    }

    // Ne pas autoriser la suppression du créateur
    if (memberId === group.groupCreator.toString() && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove group creator'
      });
    }

    await group.removeParticipant(memberId);
    await group.populate('participants', 'nom prenom photo_profil');

    res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: group
    });
  } catch (error) {
    console.error('Error removing group member:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing member'
    });
  }
};

/**
 * @desc    Quitter un groupe
 * @route   POST /api/groups/:groupId/leave
 * @access  Private
 */
exports.leaveGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: userId
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }

    // Le créateur ne peut pas quitter le groupe (il doit le supprimer)
    if (group.groupCreator.toString() === userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Group creator cannot leave. Delete the group instead.'
      });
    }

    await group.removeParticipant(userId);

    res.status(200).json({
      success: true,
      message: 'You have left the group successfully'
    });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({
      success: false,
      message: 'Error leaving group'
    });
  }
};

/**
 * @desc    Supprimer un groupe
 * @route   DELETE /api/groups/:groupId
 * @access  Private
 */
exports.deleteGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Seul le créateur peut supprimer le groupe
    if (group.groupCreator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the group creator can delete the group'
      });
    }

    // Supprimer tous les messages du groupe
    await Message.deleteMany({ groupId: groupId });

    // Supprimer le groupe
    await group.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting group'
    });
  }
};

/**
 * @desc    Mettre à jour les informations du groupe
 * @route   PUT /api/groups/:groupId
 * @access  Private
 */
exports.updateGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { name, description, avatar } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Vérifier que l'utilisateur est admin
    const isAdmin = group.groupAdmins.some(
      (adminId) => adminId.toString() === userId.toString()
    );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update group information'
      });
    }

    if (name) group.groupName = name;
    if (description !== undefined) group.groupDescription = description;
    if (avatar) group.groupAvatar = avatar;

    await group.save();
    await group.populate('participants', 'nom prenom photo_profil');

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: group
    });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating group'
    });
  }
};

/**
 * @desc    Promouvoir un membre en admin
 * @route   POST /api/groups/:groupId/admins/:memberId
 * @access  Private
 */
exports.promoteToAdmin = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId, memberId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group or member ID'
      });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: 'group'
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Seul le créateur peut promouvoir des admins
    if (group.groupCreator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the group creator can promote admins'
      });
    }

    // Vérifier que le membre fait partie du groupe
    if (!group.participants.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this group'
      });
    }

    await group.promoteAdmin(memberId);
    await group.populate('groupAdmins', 'nom prenom photo_profil');

    res.status(200).json({
      success: true,
      message: 'Member promoted to admin successfully',
      data: group
    });
  } catch (error) {
    console.error('Error promoting admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error promoting member'
    });
  }
};

module.exports = exports;