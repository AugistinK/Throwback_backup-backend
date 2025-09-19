// controllers/adminLikesController.js
const mongoose = require('mongoose');
const Like = require('../models/Like');
const Video = require('../models/Video');
const Post = require('../models/Post');
const Comment = require('../models/Comment');

/**
 * Normalisation de l'énum
 */
const toEnum = (v) => (v || '').toString().trim().toUpperCase();

/**
 * GET /api/admin/likes
 * Filtres: page,limit,search,userId,type,targetId,dateFrom,dateTo,action,sortBy
 */
const getAllLikes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      userId = '',
      type = 'all',              // VIDEO|POST|COMMENT|all
      targetId = '',
      dateFrom = '',
      dateTo = '',
      action = 'all',            // LIKE|DISLIKE|all
      sortBy = 'recent',         // recent|oldest|most_active
    } = req.query;

    const filter = {};

    if (type !== 'all') filter.type_entite = toEnum(type);
    if (action !== 'all') filter.type_action = toEnum(action);

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.utilisateur = userId;
    }
    if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
      filter.entite_id = targetId;
    }
    if (dateFrom || dateTo) {
      filter.creation_date = {};
      if (dateFrom) filter.creation_date.$gte = new Date(dateFrom);
      if (dateTo)   filter.creation_date.$lte = new Date(dateTo);
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { type_entite: new RegExp(q, 'i') },
        { type_action: new RegExp(q, 'i') },
      ];
    }

    let sort = { creation_date: -1 };
    if (sortBy === 'oldest') sort = { creation_date: 1 };
    if (sortBy === 'most_active') sort = { type_entite: 1, entite_id: 1, creation_date: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Like.countDocuments(filter);

    const likes = await Like.find(filter)
      .populate('utilisateur', 'nom prenom email photo_profil')
      .populate('video_id', 'titre artiste type')
      .populate('post_id', 'contenu type_media')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // enrichir avec les données de commentaires quand type = COMMENT
    const commentIds = likes
      .filter(l => l.type_entite === 'COMMENT')
      .map(l => l.entite_id)
      .filter(Boolean);

    let commentsMap = {};
    if (commentIds.length) {
      const comments = await Comment.find({ _id: { $in: commentIds } })
        .select('contenu auteur video_id post_id')
        .populate('auteur', 'nom prenom')
        .lean();
      commentsMap = Object.fromEntries(comments.map(c => [c._id.toString(), c]));
    }

    const rows = likes.map(like => ({
      ...like,
      target: like.type_entite === 'VIDEO'
        ? like.video_id
        : like.type_entite === 'POST'
        ? like.post_id
        : commentsMap[like.entite_id?.toString()] || null
    }));

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin likes:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des likes' });
  }
};

/**
 * GET /api/admin/likes/stats
 * byType, time-series, topLikedContent, topLikers
 */
const getLikesStats = async (_req, res) => {
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7  * 86400000);
    const d30 = new Date(now.getTime() - 30 * 86400000);

    const [facet, topContent, topUsers] = await Promise.all([
      Like.aggregate([
        {
          $facet: {
            byType: [
              { $group: { _id: '$type_entite', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            last7Days: [
              { $match: { creation_date: { $gte: d7 } } },
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$creation_date' } }, count: { $sum: 1 } } },
              { $sort: { _id: 1 } }
            ],
            last30Days: [
              { $match: { creation_date: { $gte: d30 } } },
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$creation_date' } }, count: { $sum: 1 } } },
              { $sort: { _id: 1 } }
            ],
            total: [{ $count: 'total' }]
          }
        }
      ]),
      Like.aggregate([
        { $match: { type_action: 'LIKE' } },
        { $group: { _id: { type: '$type_entite', id: '$entite_id' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Like.aggregate([
        { $match: { type_action: 'LIKE' } },
        { $group: { _id: '$utilisateur', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    // enrichissement des contenus (selon type)
    const enrichedTop = await Promise.all(topContent.map(async t => {
      const { type, id } = t._id;
      if (type === 'VIDEO') {
        const v = await Video.findById(id).select('titre artiste type').lean();
        return { ...t, entity: v || null };
      }
      if (type === 'POST') {
        const p = await Post.findById(id).select('contenu type_media').lean();
        return { ...t, entity: p || null };
      }
      if (type === 'COMMENT') {
        const c = await Comment.findById(id).select('contenu auteur').populate('auteur', 'nom prenom').lean();
        return { ...t, entity: c || null };
      }
      return t;
    }));

    // enrichissement des utilisateurs
    const User = Comment.db.model('User'); // éviter require circulaire
    const users = await User.find({ _id: { $in: topUsers.map(u => u._id) } })
      .select('nom prenom email photo_profil')
      .lean();
    const map = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    const topLikers = topUsers.map(u => ({ ...u, user: map[u._id.toString()] || null }));

    res.json({
      success: true,
      data: {
        ...(facet[0] || {}),
        topLikedContent: enrichedTop,
        topLikers
      }
    });
  } catch (error) {
    console.error('Error fetching likes stats:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des statistiques' });
  }
};

/**
 * GET /api/admin/likes/:id
 */
const getLikeDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const like = await Like.findById(id)
      .populate('utilisateur', 'nom prenom email photo_profil')
      .lean();

    if (!like) return res.status(404).json({ success: false, message: 'Like introuvable' });

    let entity = null;
    if (like.type_entite === 'VIDEO') {
      entity = await Video.findById(like.entite_id).select('titre artiste type').lean();
    } else if (like.type_entite === 'POST') {
      entity = await Post.findById(like.entite_id).select('contenu type_media').lean();
    } else if (like.type_entite === 'COMMENT') {
      entity = await Comment.findById(like.entite_id).select('contenu auteur').populate('auteur', 'nom prenom').lean();
    }

    res.json({ success: true, data: { like, entity } });
  } catch (error) {
    console.error('Error fetching like details:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération du like' });
  }
};

/**
 * DELETE /api/admin/likes/:id
 * Supprime un like et décrémente les compteurs simples (Video/Comment)
 */
const deleteLike = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const like = await Like.findById(id);
    if (!like) return res.status(404).json({ success: false, message: 'Like introuvable' });

    await Like.deleteOne({ _id: id });

    if (like.type_action === 'LIKE') {
      if (like.type_entite === 'VIDEO') {
        await Video.updateOne({ _id: like.entite_id }, { $inc: { likes: -1 } });
      } else if (like.type_entite === 'COMMENT') {
        await Comment.updateOne({ _id: like.entite_id }, { $inc: { likes: -1 } });
      }
    }

    res.json({ success: true, message: 'Like supprimé' });
  } catch (error) {
    console.error('Error deleting like:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
};

/**
 * DELETE /api/admin/likes/bulk
 * Payload: { likeIds: [] } ou { userId, type, targetId }
 */
const bulkDeleteLikes = async (req, res) => {
  try {
    const { likeIds = [], userId = '', type = 'all', targetId = '' } = req.body;

    const filter = {};
    if (Array.isArray(likeIds) && likeIds.length) {
      filter._id = { $in: likeIds.filter(mongoose.Types.ObjectId.isValid) };
    } else {
      if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.utilisateur = userId;
      if (type !== 'all') filter.type_entite = toEnum(type);
      if (targetId && mongoose.Types.ObjectId.isValid(targetId)) filter.entite_id = targetId;
    }

    const toDelete = await Like.find(filter).lean();
    if (!toDelete.length) {
      return res.json({ success: true, message: 'Aucun like correspondant', data: { deletedCount: 0 } });
    }

    const { deletedCount } = await Like.deleteMany({ _id: { $in: toDelete.map(l => l._id) } });

    const decVideo = {};
    const decComment = {};
    for (const l of toDelete) {
      if (l.type_action === 'LIKE') {
        if (l.type_entite === 'VIDEO') decVideo[l.entite_id] = (decVideo[l.entite_id] || 0) + 1;
        if (l.type_entite === 'COMMENT') decComment[l.entite_id] = (decComment[l.entite_id] || 0) + 1;
      }
    }

    await Promise.all([
      ...Object.entries(decVideo).map(([id, n]) => Video.updateOne({ _id: id }, { $inc: { likes: -n } })),
      ...Object.entries(decComment).map(([id, n]) => Comment.updateOne({ _id: id }, { $inc: { likes: -n } })),
    ]);

    res.json({ success: true, message: 'Suppression en lot effectuée', data: { deletedCount } });
  } catch (error) {
    console.error('Error bulk deleting likes:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression en lot' });
  }
};

module.exports = {
  getAllLikes,
  getLikesStats,
  getLikeDetails,
  deleteLike,
  bulkDeleteLikes
};
