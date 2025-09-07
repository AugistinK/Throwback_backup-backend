const LiveChatMessage = require('../models/liveChatMessage');
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');

const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'error';
const logger = {
  debug: (...a) => LOG_LEVEL === 'debug' && console.log('[chat]', ...a),
  info:  (...a) => ['debug', 'info'].includes(LOG_LEVEL) && console.log('[chat]', ...a),
  warn:  (...a) => console.warn('[chat]', ...a),
  error: (...a) => console.error('[chat]', ...a)
};

/** GET /api/livechat/:streamId */
exports.getMessages = async (req, res) => {
  try {
    const { streamId } = req.params;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const livestream = await LiveStream.findById(streamId);
    if (!livestream) return res.status(404).json({ success: false, message: 'Livestream non trouvé' });
    if (livestream.chatEnabled === false) return res.status(403).json({ success: false, message: 'Le chat est désactivé pour ce livestream', chatDisabled: true });
    if (req.user && livestream.bannedUsers?.some(id => id.toString() === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Vous avez été banni de ce chat', userBanned: true });
    }

    const messages = await LiveChatMessage.getStreamMessages(streamId, page, limit);
    const total = await LiveChatMessage.countDocuments({ livestreamId: streamId, parentId: null, isDeleted: false });

    // enrichir userLiked + replyCount
    const enhanced = (req.user ? messages.map(m => {
      const liked = (m.likedBy || []).some(id => id.toString() === req.user.id);
      const obj = m.toObject();
      obj.userLiked = liked;
      obj.replyCount = m.repliesCount || (obj.replies ? obj.replies.length : 0);

      // flag userLiked pour chaque reply
      if (Array.isArray(obj.replies)) {
        obj.replies = obj.replies.map(r => {
          const rObj = r.toObject ? r.toObject() : r;
          rObj.userLiked = (r.likedBy || []).some(id => id.toString() === req.user.id);
          return rObj;
        });
      }
      return obj;
    }) : messages).map(m => {
      // même sans req.user, on veut renvoyer replyCount
      if (m.replyCount == null) m.replyCount = m.repliesCount || (Array.isArray(m.replies) ? m.replies.length : 0);
      return m;
    });

    if (req.user) {
      try {
        await LogAction.create({
          type_action: 'VIEW_LIVESTREAM_CHAT',
          description_action: `Consultation du chat pour le livestream "${livestream.title}"`,
          id_user: req.user.id,
          created_by: req.user.id
        });
      } catch (e) { logger.error('log view error', e); }
    }

    res.status(200).json({
      success: true,
      data: enhanced,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('getMessages', error);
    res.status(500).json({ success: false, message: 'Une erreur est survenue lors de la récupération des messages', error: error.message });
  }
};

/** GET /api/livechat/:streamId/messages/:messageId/replies?page&limit */
exports.getReplies = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;

    const parent = await LiveChatMessage.findOne({ _id: messageId, livestreamId: streamId, isDeleted: false });
    if (!parent) return res.status(404).json({ success: false, message: 'Message parent non trouvé' });

    const skip = (page - 1) * limit;
    const replies = await LiveChatMessage.find({ livestreamId: streamId, parentId: messageId, isDeleted: false })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'nom prenom photo_profil');

    const total = await LiveChatMessage.countDocuments({ livestreamId: streamId, parentId: messageId, isDeleted: false });

    const withLike = req.user
      ? replies.map(r => {
          const obj = r.toObject();
          obj.userLiked = (r.likedBy || []).some(id => id.toString() === req.user.id);
          return obj;
        })
      : replies;

    res.status(200).json({
      success: true,
      data: withLike,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (e) {
    logger.error('getReplies', e);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des réponses', error: e.message });
  }
};

/** POST /api/livechat/:streamId */
exports.addMessage = async (req, res) => {
  try {
    const { streamId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) return res.status(400).json({ success: false, message: 'Le contenu du message ne peut pas être vide' });

    const livestream = await LiveStream.findById(streamId);
    if (!livestream) return res.status(404).json({ success: false, message: 'Livestream non trouvé' });
    if (livestream.status !== 'LIVE') return res.status(400).json({ success: false, message: 'Le livestream n\'est pas en cours' });
    if (livestream.chatEnabled === false) return res.status(403).json({ success: false, message: 'Le chat est désactivé pour ce livestream' });
    if (livestream.bannedUsers?.some(id => id.toString() === userId)) return res.status(403).json({ success: false, message: 'Vous avez été banni de ce chat' });

    if (parentId) {
      const parent = await LiveChatMessage.findById(parentId);
      if (!parent || parent.livestreamId.toString() !== streamId) return res.status(404).json({ success: false, message: 'Message parent non trouvé' });
    }

    const metadata = { userAgent: req.headers['user-agent'], ipAddress: req.ip };
    const doc = await LiveChatMessage.create({ livestreamId: streamId, userId, content: content.trim(), parentId: parentId || null, metadata });

    await LiveStream.findByIdAndUpdate(streamId, { $inc: { 'statistics.chatMessages': 1 } });

    const populated = await LiveChatMessage.findById(doc._id).populate('userId', 'nom prenom photo_profil');
    const obj = populated.toObject();
    obj.userLiked = false;

    res.status(201).json({ success: true, message: 'Message ajouté avec succès', data: obj });
  } catch (e) {
    logger.error('addMessage', e);
    res.status(500).json({ success: false, message: 'Une erreur est survenue lors de l\'ajout du message', error: e.message });
  }
};

/** POST /api/livechat/:streamId/messages/:messageId/like */
exports.likeMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const userId = req.user.id;

    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      return res.status(404).json({ success: false, message: 'Message non trouvé' });
    }

    const already = (message.likedBy || []).some(id => id.toString() === userId);
    const updated = already
      ? await LiveChatMessage.removeLike(messageId, userId)
      : await LiveChatMessage.addLike(messageId, userId);

    const populated = await LiveChatMessage.findById(updated._id).populate('userId', 'nom prenom photo_profil');
    const obj = populated.toObject();
    obj.userLiked = !already;

    res.status(200).json({ success: true, message: already ? 'Like retiré avec succès' : 'Like ajouté avec succès', data: obj });
  } catch (e) {
    logger.error('likeMessage', e);
    res.status(500).json({ success: false, message: 'Une erreur est survenue lors du like', error: e.message });
  }
};

/** DELETE /api/livechat/:streamId/messages/:messageId */
exports.deleteMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const userId = req.user.id;

    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      return res.status(404).json({ success: false, message: 'Message non trouvé' });
    }

    const isAuthor = message.userId.toString() === userId;
    const isAdmin  = req.user.role === 'admin' || req.user.role === 'superadmin' || (req.user.roles || []).some(r => r === 'admin' || r === 'superadmin' || r.libelle_role === 'admin' || r.libelle_role === 'superadmin');
    if (!isAuthor && !isAdmin) return res.status(403).json({ success: false, message: 'Vous n\'êtes pas autorisé à supprimer ce message' });

    message.isDeleted = true;
    message.content = isAdmin ? '[Message supprimé par un modérateur]' : '[Message supprimé]';
    message.moderationReason = isAdmin ? (req.body.reason || 'Modération') : null;
    await message.save();

    await LogAction.create({
      type_action: isAdmin ? 'MODERATION_MESSAGE' : 'DELETE_OWN_MESSAGE',
      description_action: isAdmin ? `Modération d'un message` : `Suppression de son propre message`,
      id_user: userId,
      created_by: userId
    });

    res.status(200).json({ success: true, message: 'Message supprimé avec succès' });
  } catch (e) {
    logger.error('deleteMessage', e);
    res.status(500).json({ success: false, message: 'Une erreur est survenue lors de la suppression du message', error: e.message });
  }
};

/** POST /api/livechat/:streamId/messages/:messageId/report */
exports.reportMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      return res.status(404).json({ success: false, message: 'Message non trouvé' });
    }
    if (message.userId.toString() === userId) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas signaler votre propre message' });
    }

    await LogAction.create({
      type_action: 'REPORT_MESSAGE',
      description_action: `Signalement d'un message dans le livestream "${streamId}"`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: {
        messageId,
        messageContent: message.content,
        messageAuthor: message.userId,
        reportReason: reason || 'Non spécifié'
      }
    });

    res.status(200).json({ success: true, message: 'Message signalé avec succès' });
  } catch (e) {
    logger.error('reportMessage', e);
    res.status(500).json({ success: false, message: 'Une erreur est survenue lors du signalement', error: e.message });
  }
};
