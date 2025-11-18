// controllers/conversationsController.js
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');
const { createNotification } = require('../services/notificationService');

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
      archivedBy: { $ne: userObjectId },
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
          deleted: false,
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
          isPinned:
            Array.isArray(conv.pinned) &&
            conv.pinned.some((id) => id.toString() === userId.toString()),
          isMuted:
            Array.isArray(conv.muted) &&
            conv.muted.some(
              (m) => m.user && m.user.toString() === userId.toString()
            ),
        };
      })
    );

    res.status(200).json({
      success: true,
      data: conversationsWithUnread,
    });
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations',
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
        message: 'Friend ID is required',
      });
    }

    // Vérifier si les utilisateurs sont amis
    const areFriends = await Friendship.areFriends(userId, friendId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only message your friends',
      });
    }

    const conversation = await Conversation.getOrCreateDirectConversation(
      userId,
      friendId
    );

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('Error in getOrCreateDirectConversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la conversation',
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
    let { name, participants, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required',
      });
    }

    const cleanedName = name.trim();

    // Sécuriser la liste des participants
    if (!Array.isArray(participants)) {
      participants = [];
    }

    // Normaliser en string + remove doublons
    const userIdStr = userId.toString();
    let normalized = [...new Set(participants.map((p) => p.toString()))];

    // Ne pas inclure le créateur dans la liste des participants à vérifier
    normalized = normalized.filter((id) => id !== userIdStr);

    // Au moins 2 autres personnes pour faire un "vrai" groupe (créateur + 2 amis = 3)
    if (normalized.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 participants are required',
      });
    }

    // Vérifier quels participants sont réellement amis avec le créateur
    const friendshipChecks = await Promise.all(
      normalized.map(async (p) => ({
        id: p,
        ok: await Friendship.areFriends(userId, p),
      }))
    );

    const validParticipants = friendshipChecks
      .filter((f) => f.ok)
      .map((f) => f.id);

    const invalidParticipants = friendshipChecks
      .filter((f) => !f.ok)
      .map((f) => f.id);

    // Si après filtrage il reste moins de 2 amis -> on ne crée pas le groupe
    if (validParticipants.length < 2) {
      return res.status(403).json({
        success: false,
        message: 'You can only create a group with at least two friends',
        invalidParticipants,
      });
    }

    // Création du groupe (Conversation.createGroup ajoute déjà le créateur)
    const group = await Conversation.createGroup(
      userId,
      cleanedName,
      validParticipants,
      description
    );

    // Log action
    await LogAction.create({
      type_action: 'GROUP_CREATED',
      description_action: `Created group: ${cleanedName}`,
      id_user: userId,
      created_by: 'SYSTEM',
    });

    const io = req.app.get('io');

    // Émettre événement Socket.IO à tous les participants + créateur
    if (io) {
      const recipients = [
        userIdStr,
        ...validParticipants.map((id) => id.toString()),
      ];

      recipients.forEach((participantId) => {
        io.to(participantId).emit('group-created', {
          group,
          createdBy: userId,
        });
      });
    }

    // Créer une notification pour chaque membre (sauf le créateur)
    const participantsToNotify = validParticipants.filter(
      (id) => id.toString() !== userIdStr
    );

    for (const participantId of participantsToNotify) {
      try {
        const notif = await createNotification({
          userId: participantId,
          actorId: userId,
          type: 'chat_group_created',
          title: 'Nouveau groupe de discussion',
          message: `Vous avez été ajouté au groupe "${cleanedName}"`,
          link: `/dashboard/chat?group=${group._id.toString()}`,
          metadata: {
            groupId: group._id,
            groupName: cleanedName,
            creatorId: userId,
          },
        });

        if (io && notif) {
          io.to(participantId.toString()).emit('notification:new', {
            id: notif._id.toString(),
            type: notif.type,
            title: notif.title,
            message: notif.message,
            link: notif.link,
            read: notif.read,
            createdAt: notif.createdAt,
            actor: notif.actor,
            metadata: notif.metadata || {},
          });
        }
      } catch (err) {
        console.error(
          'Error creating group creation notification:',
          err.message
        );
      }
    }

    return res.status(201).json({
      success: true,
      message:
        invalidParticipants.length > 0
          ? 'Group created successfully (some users were not added because they are not your friends)'
          : 'Group created successfully',
      data: group,
      invalidParticipants,
    });
  } catch (error) {
    console.error('Error in createGroup:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du groupe',
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
      type: 'group',
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Vérifier que l'utilisateur est admin
    if (
      !Array.isArray(conversation.groupAdmins) ||
      !conversation.groupAdmins.some(
        (id) => id.toString() === userId.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update group',
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
    if (io && Array.isArray(conversation.participants)) {
      conversation.participants.forEach((p) => {
        const pid = p._id ? p._id.toString() : p.toString();
        io.to(pid).emit('group-updated', {
          group: conversation,
        });
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: conversation,
    });
  } catch (error) {
    console.error('Error in updateGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du groupe',
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
      type: 'group',
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Vérifier que l'utilisateur est admin
    if (
      !Array.isArray(conversation.groupAdmins) ||
      !conversation.groupAdmins.some(
        (id) => id.toString() === userId.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add participants',
      });
    }

    // Vérifier que le participant est ami avec l'admin
    const areFriends = await Friendship.areFriends(userId, participantId);
    if (!areFriends) {
      return res.status(403).json({
        success: false,
        message: 'You can only add friends',
      });
    }

    await conversation.addParticipant(participantId, userId);
    await conversation.populate('participants groupAdmins');

    // Notifier le nouveau participant
    const io = req.app.get('io');
    if (io) {
      io.to(participantId.toString()).emit('added-to-group', {
        group: conversation,
        addedBy: userId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Participant added successfully',
      data: conversation,
    });
  } catch (error) {
    console.error('Error in addParticipantToGroup:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'ajout du participant",
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
      type: 'group',
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Vérifier que l'utilisateur est admin ou se retire lui-même
    const isAdmin =
      Array.isArray(conversation.groupAdmins) &&
      conversation.groupAdmins.some(
        (id) => id.toString() === userId.toString()
      );
    const isSelf = userId.toString() === participantId.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove participants',
      });
    }

    await conversation.removeParticipant(participantId);

    // Notifier le participant retiré
    const io = req.app.get('io');
    if (io) {
      io.to(participantId.toString()).emit('removed-from-group', {
        groupId,
        removedBy: userId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully',
    });
  } catch (error) {
    console.error('Error in removeParticipantFromGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du retrait du participant',
    });
  }
};

/**
 * @desc    Supprimer un groupe de conversation
 * @route   DELETE /api/conversations/groups/:groupId
 * @access  Private
 */
exports.deleteGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID',
      });
    }

    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group',
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Seul le créateur ou un admin peut supprimer le groupe
    const isCreator =
      conversation.groupCreator &&
      conversation.groupCreator.toString() === userId.toString();
    const isAdmin =
      Array.isArray(conversation.groupAdmins) &&
      conversation.groupAdmins.some(
        (id) => id.toString() === userId.toString()
      );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the group creator or an admin can delete this group',
      });
    }

    // Soft delete des messages du groupe
    await Message.updateMany(
      { groupId: conversation._id, isGroupMessage: true },
      { $set: { deleted: true } }
    );

    // Suppression de la conversation elle-même
    await Conversation.deleteOne({ _id: conversation._id });

    // Log
    await LogAction.create({
      type_action: 'GROUP_DELETED',
      description_action: `Deleted group: ${
        conversation.groupName || conversation._id
      }`,
      id_user: userId,
      created_by: 'SYSTEM',
    });

    // Notifier les participants via Socket.IO
    const io = req.app.get('io');
    if (io && Array.isArray(conversation.participants)) {
      conversation.participants.forEach((p) => {
        const pid = p._id ? p._id.toString() : p.toString();
        io.to(pid).emit('group-deleted', {
          groupId: groupId.toString(),
          deletedBy: userId,
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du groupe',
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
        message: 'Conversation not found',
      });
    }

    // Vérifier que l'utilisateur est participant
    if (
      !Array.isArray(conversation.participants) ||
      !conversation.participants.some(
        (id) => id.toString() === userId.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not a participant',
      });
    }

    await conversation.archive(userId);

    res.status(200).json({
      success: true,
      message: 'Conversation archived successfully',
    });
  } catch (error) {
    console.error('Error in archiveConversation:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'archivage",
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
        message: 'Conversation not found',
      });
    }

    if (
      !Array.isArray(conversation.pinned) ||
      !conversation.pinned.some(
        (id) => id.toString() === userId.toString()
      )
    ) {
      conversation.pinned.push(userId);
      await conversation.save();
    }

    res.status(200).json({
      success: true,
      message: 'Conversation pinned successfully',
    });
  } catch (error) {
    console.error('Error in pinConversation:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'épinglage",
    });
  }
};

/**
 * @desc    Récupérer les messages d'un groupe de conversation
 * @route   GET /api/conversations/groups/:groupId/messages
 * @access  Private
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID',
      });
    }

    // Vérifier que la conversation existe et que l'utilisateur est membre
    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: new mongoose.Types.ObjectId(userId),
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group conversation not found or you are not a member',
      });
    }

    const [messages, total] = await Promise.all([
      Message.find({
        groupId: conversation._id,
        isGroupMessage: true,
        deleted: false,
      })
        .sort({ created_date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'nom prenom email photo_profil'),
      Message.countDocuments({
        groupId: conversation._id,
        isGroupMessage: true,
        deleted: false,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // ordre chronologique
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    console.error('Error in getGroupMessages:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des messages du groupe',
    });
  }
};



/**
 * @desc    Envoyer un message dans un groupe de conversation
 * @route   POST /api/conversations/groups/:groupId/messages
 * @access  Private
 */
exports.sendGroupMessage = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { content, type } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID',
      });
    }

    // Vérifier que la conversation existe et que l'utilisateur est membre
    const conversation = await Conversation.findOne({
      _id: groupId,
      type: 'group',
      participants: new mongoose.Types.ObjectId(userId),
    }).populate('participants', '_id');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Group conversation not found or you are not a member',
      });
    }

    // Création du message de groupe avec le nouveau schéma
    const message = await Message.create({
      sender: userId,
      groupId: conversation._id,
      content: content.trim(),
      type: type || 'text',
      created_by: userId,
      isGroupMessage: true,
    });

    await message.populate('sender', 'nom prenom email photo_profil');

    // Mettre à jour le dernier message de la conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Log action
    await LogAction.create({
      type_action: 'GROUP_MESSAGE_SENT',
      description_action: `Message sent in group ${
        conversation.groupName || conversation._id
      }`,
      id_user: userId,
      created_by: 'SYSTEM',
    });

    // Notifier les membres via Socket.IO
    const io = req.app.get('io');
    if (io && conversation.participants && conversation.participants.length > 0) {
      conversation.participants.forEach((p) => {
        const pid = p._id ? p._id.toString() : p.toString();
        if (pid !== userId.toString()) {
          io.to(pid).emit('group-message', {
            groupId: conversation._id.toString(),
            message,
          });
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    console.error('Error in sendGroupMessage:', error);
    if (error && error.errors) {
      console.error('Validation errors in sendGroupMessage:', error.errors);
    }
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message au groupe",
    });
  }
};


module.exports = exports;
