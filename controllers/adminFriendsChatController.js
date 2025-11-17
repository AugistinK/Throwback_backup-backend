// controllers/adminFriendsChatController.js
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const FriendGroup = require('../models/FriendGroup');
const Report = require('../models/Report');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * Admin – Vue d'ensemble globale Friends & Chat
 * @route   GET /api/admin/friends-chat/overview
 * @access  Private/Admin
 */
exports.getOverview = async (req, res) => {
  try {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);

    const [
      totalFriendships,
      pendingRequests,
      blockedRelations,
      totalMessages,
      messagesLast24h,
      totalGroups,
      totalConversations,
      openReports,
      resolvedReports
    ] = await Promise.all([
      Friendship.countDocuments({ status: 'accepted' }),
      Friendship.countDocuments({ status: 'pending' }),
      Friendship.countDocuments({ status: 'blocked' }),
      Message.countDocuments({}),
      Message.countDocuments({ created_date: { $gte: since24h } }),
      FriendGroup.countDocuments({}),
      Conversation.countDocuments({}),
      Report.countDocuments({
        status: { $in: ['pending', 'reviewing'] }
      }),
      Report.countDocuments({
        status: { $in: ['resolved', 'dismissed'] }
      })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        friendships: {
          total: totalFriendships,
          pendingRequests,
          blockedRelations
        },
        messages: {
          total: totalMessages,
          last24h: messagesLast24h
        },
        groups: {
          friendGroups: totalGroups,
          conversations: totalConversations
        },
        reports: {
          open: openReports,
          resolved: resolvedReports
        }
      }
    });
  } catch (error) {
    console.error('Admin getOverview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement de la vue d’ensemble admin Friends & Chat'
    });
  }
};

/**
 * Admin – Résumé social d’un utilisateur
 * @route   GET /api/admin/friends-chat/users/:userId
 * @access  Private/Admin
 */
exports.getUserSocialSummary = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId).select(
      'nom prenom email photo_profil ville statut_compte'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const [
      friends,
      blockedByUser,
      blockedUser,
      messagesCount,
      reportsByUser,
      reportsAgainstUser
    ] = await Promise.all([
      Friendship.getFriends(userId),
      Friendship.countDocuments({
        requester: userId,
        status: 'blocked'
      }),
      Friendship.countDocuments({
        receiver: userId,
        status: 'blocked'
      }),
      Message.countDocuments({
        $or: [{ sender: userId }, { receiver: userId }]
      }),
      Report.countDocuments({ reporter: userId }),
      Report.countDocuments({ reportedUser: userId })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user,
        stats: {
          friendsCount: friends.length,
          blockedByUser,
          blockedUser,
          messagesCount,
          reportsByUser,
          reportsAgainstUser
        },
        friends
      }
    });
  } catch (error) {
    console.error('Admin getUserSocialSummary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du résumé utilisateur'
    });
  }
};

/**
 * Admin – Lister les relations d’amitié
 * @route   GET /api/admin/friends-chat/friendships
 * @query   status=pending|accepted|blocked, q, page, limit
 * @access  Private/Admin
 */
exports.listFriendships = async (req, res) => {
  try {
    const { status, q } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    const baseQuery = {};
    if (status) {
      baseQuery.status = status;
    }

    let friendships = await Friendship.find(baseQuery)
      .populate('requester receiver', 'nom prenom email photo_profil')
      .sort({ created_date: -1 });

    if (q && q.trim().length > 1) {
      const qLower = q.toLowerCase();
      friendships = friendships.filter((f) => {
        const r = f.requester || {};
        const rec = f.receiver || {};
        const haystack = [
          r.nom,
          r.prenom,
          r.email,
          rec.nom,
          rec.prenom,
          rec.email
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(qLower);
      });
    }

    const total = friendships.length;
    const paginated = friendships.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin listFriendships error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des relations d’amitié'
    });
  }
};

/**
 * Admin – Supprimer / forcer la fin d’une relation d’amitié
 * @route   DELETE /api/admin/friends-chat/friendships/:friendshipId
 * @access  Private/Admin
 */
exports.deleteFriendship = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { friendshipId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friendship ID'
      });
    }

    const friendship = await Friendship.findByIdAndDelete(friendshipId);

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    await LogAction.create({
      type_action: 'ADMIN_FRIENDSHIP_DELETED',
      description_action: `Admin ${adminId} deleted friendship ${friendshipId}`,
      id_user: adminId,
      created_by: 'ADMIN',
      donnees_supplementaires: {
        friendshipId,
        requester: friendship.requester,
        receiver: friendship.receiver
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Friendship deleted successfully by admin'
    });
  } catch (error) {
    console.error('Admin deleteFriendship error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la relation'
    });
  }
};

/**
 * Admin – Lister tous les blocages
 * @route   GET /api/admin/friends-chat/blocks
 * @access  Private/Admin
 */
exports.listBlockedRelationships = async (req, res) => {
  try {
    const blocked = await Friendship.find({ status: 'blocked' })
      .populate('requester receiver', 'nom prenom email photo_profil')
      .sort({ created_date: -1 });

    return res.status(200).json({
      success: true,
      data: blocked
    });
  } catch (error) {
    console.error('Admin listBlockedRelationships error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des blocages'
    });
  }
};

/**
 * Admin – Lister les conversations
 * @route   GET /api/admin/friends-chat/conversations
 * @query   userId, type (direct|group)
 * @access  Private/Admin
 */
exports.listConversations = async (req, res) => {
  try {
    const { userId, type } = req.query;
    const query = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }
      query.participants = new mongoose.Types.ObjectId(userId);
    }

    if (type) {
      query.type = type;
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'nom prenom email photo_profil')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Admin listConversations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations'
    });
  }
};

/**
 * Admin – Messages d’une conversation (group ou direct si Conversation utilisé)
 * @route   GET /api/admin/friends-chat/conversations/:conversationId/messages
 * @access  Private/Admin
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const total = await Message.countDocuments({
      conversation: conversation._id,
      deleted: false
    });

    const messages = await Message.find({
      conversation: conversation._id,
      deleted: false
    })
      .sort({ created_date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender receiver', 'nom prenom email photo_profil');

    return res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin getConversationMessages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des messages de la conversation'
    });
  }
};

/**
 * Admin – Messages directs entre deux utilisateurs (sans Conversation)
 * @route   GET /api/admin/friends-chat/direct-messages
 * @query   userA, userB, page, limit
 * @access  Private/Admin
 */
exports.getDirectMessagesBetweenUsers = async (req, res) => {
  try {
    const { userA, userB } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    if (
      !mongoose.Types.ObjectId.isValid(userA) ||
      !mongoose.Types.ObjectId.isValid(userB)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user IDs'
      });
    }

    const total = await Message.countDocuments({
      $or: [
        { sender: userA, receiver: userB },
        { sender: userB, receiver: userA }
      ],
      deleted: false
    });

    const messages = await Message.find({
      $or: [
        { sender: userA, receiver: userB },
        { sender: userB, receiver: userA }
      ],
      deleted: false
    })
      .sort({ created_date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender receiver', 'nom prenom email photo_profil');

    return res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin getDirectMessagesBetweenUsers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des messages directs'
    });
  }
};

/**
 * Admin – Supprimer un message (modération)
 * @route   DELETE /api/admin/friends-chat/messages/:messageId
 * @access  Private/Admin
 */
exports.adminDeleteMessage = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    message.deleted = true;
    message.deletedBy = [message.sender, message.receiver].filter(Boolean);
    message.deletedForEveryone = true;
    await message.save();

    await LogAction.create({
      type_action: 'ADMIN_MESSAGE_DELETED',
      description_action: `Admin ${adminId} deleted message ${messageId}`,
      id_user: adminId,
      created_by: 'ADMIN',
      donnees_supplementaires: {
        messageId,
        sender: message.sender,
        receiver: message.receiver
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully by admin'
    });
  } catch (error) {
    console.error('Admin adminDeleteMessage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du message'
    });
  }
};

/**
 * Admin – Lister les reports
 * @route   GET /api/admin/friends-chat/reports
 * @query   status, resolution, page, limit
 * @access  Private/Admin
 */
exports.listReports = async (req, res) => {
  try {
    const { status, resolution } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (resolution) query.resolution = resolution;

    const total = await Report.countDocuments(query);

    const reports = await Report.find(query)
      .populate('reporter', 'nom prenom email photo_profil')
      .populate('reportedUser', 'nom prenom email photo_profil')
      .populate('messageId', 'content sender receiver created_date')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin listReports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des signalements'
    });
  }
};

/**
 * Admin – Mettre à jour un report (statut / résolution)
 * @route   PUT /api/admin/friends-chat/reports/:reportId
 * @access  Private/Admin
 */
exports.updateReport = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { reportId } = req.params;
    const { status, resolution, adminNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    const ALLOWED_STATUS = new Set(['pending', 'reviewing', 'resolved', 'dismissed']);
    const ALLOWED_RESOLUTIONS = new Set([
      'no_action',
      'warning',
      'temporary_ban',
      'permanent_ban',
      'deleted_content'
    ]);

    if (typeof status !== 'undefined') {
      if (!ALLOWED_STATUS.has(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status value'
        });
      }
      report.status = status;
    }

    if (typeof resolution !== 'undefined') {
      if (!ALLOWED_RESOLUTIONS.has(resolution)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resolution value'
        });
      }
      report.resolution = resolution;
    }

    if (typeof adminNotes !== 'undefined') {
      report.adminNotes = adminNotes;
    }

    if (report.status === 'resolved' || report.status === 'dismissed') {
      report.resolvedBy = adminId;
      report.resolvedAt = new Date();
    }

    await report.save();

    await LogAction.create({
      type_action: 'ADMIN_REPORT_UPDATED',
      description_action: `Admin ${adminId} updated report ${reportId}`,
      id_user: adminId,
      created_by: 'ADMIN',
      donnees_supplementaires: {
        reportId,
        status: report.status,
        resolution: report.resolution
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: report
    });
  } catch (error) {
    console.error('Admin updateReport error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du signalement'
    });
  }
};

module.exports = exports;
