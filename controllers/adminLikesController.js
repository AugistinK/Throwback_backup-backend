// controllers/adminLikesController.js
const mongoose = require('mongoose');
const Like = require('../models/Like');
const Video = require('../models/Video');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');

const toEnum = (v) => (v || '').toString().trim().toUpperCase();
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

/**
 * GET /api/admin/likes
 * Query: page,limit,search,userId,type,targetId,dateFrom,dateTo,action,sortBy
 */
const getAllLikes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      userId = '',
      type = 'all',          
      targetId = '',
      dateFrom = '',
      dateTo = '',
      action = 'all',        
      sortBy = 'recent'      
    } = req.query;

    // ---------- Filtre de base ----------
    const filter = {};
    if (type !== 'all') filter.type_entite = toEnum(type);      
    if (action !== 'all') filter.type_action = toEnum(action);      
    if (userId && isObjectId(userId)) filter.utilisateur = userId;
    if (targetId && isObjectId(targetId)) filter.entite_id = targetId;

    if (dateFrom || dateTo) {
      filter.creation_date = {};
      if (dateFrom) filter.creation_date.$gte = new Date(dateFrom);
      if (dateTo)   filter.creation_date.$lte = new Date(dateTo);
    }

    // ---------- Recherche étendue ----------
    if (search && search.trim()) {
      const q = search.trim();
      const re = new RegExp(q, 'i');

      // Chercher sur plusieurs collections pour obtenir des IDs correspondants
      const [videos, posts, comments, users] = await Promise.all([
        Video.find({ $or: [{ titre: re }, { artiste: re }] }).select('_id').lean(),
        Post.find({ contenu: re }).select('_id').lean(),
        Comment.find({ contenu: re }).select('_id').lean(),
        User.find({ $or: [{ nom: re }, { prenom: re }, { email: re }] }).select('_id').lean()
      ]);

      const vIds = videos.map(v => v._id);
      const pIds = posts.map(p => p._id);
      const cIds = comments.map(c => c._id);
      const uIds = users.map(u => u._id);

      const or = [
        { type_entite: re },
        { type_action: re }
      ];
      if (uIds.length) or.push({ utilisateur: { $in: uIds } });
      if (vIds.length) or.push({ $and: [{ type_entite: 'VIDEO' },   { entite_id: { $in: vIds } }] });
      if (pIds.length) or.push({ $and: [{ type_entite: 'POST' },    { entite_id: { $in: pIds } }] });
      if (cIds.length) or.push({ $and: [{ type_entite: 'COMMENT' }, { entite_id: { $in: cIds } }] });

      filter.$or = or;
    }

    // ---------- Tri & pagination ----------
    let sort = { creation_date: -1 };
    if (sortBy === 'oldest') sort = { creation_date: 1 };
    if (sortBy === 'most_active') sort = { type_entite: 1, entite_id: 1, creation_date: -1 };

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Like.countDocuments(filter);

    // ---------- Récupération ----------
    const likes = await Like.find(filter)
      .populate('utilisateur', 'nom prenom email photo_profil')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    // ---------- Enrichissement bulk des cibles ----------
    const videoIds   = likes.filter(l => l.type_entite === 'VIDEO').map(l => l.entite_id).filter(Boolean);
    const postIds    = likes.filter(l => l.type_entite === 'POST').map(l => l.entite_id).filter(Boolean);
    const commentIds = likes.filter(l => l.type_entite === 'COMMENT').map(l => l.entite_id).filter(Boolean);

    const [videosMap, postsMap, commentsMap] = await Promise.all([
      (async () => {
        if (!videoIds.length) return {};
        const arr = await Video.find({ _id: { $in: videoIds } }).select('titre artiste type').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!postIds.length) return {};
        const arr = await Post.find({ _id: { $in: postIds } }).select('contenu type_media').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!commentIds.length) return {};
        const arr = await Comment.find({ _id: { $in: commentIds } })
          .select('contenu auteur')
          .populate('auteur', 'nom prenom')
          .lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })()
    ]);

    const rows = likes.map(like => {
      const key = like.entite_id?.toString();
      let target = null;
      if (like.type_entite === 'VIDEO')   target = videosMap[key]   || null;
      if (like.type_entite === 'POST')    target = postsMap[key]    || null;
      if (like.type_entite === 'COMMENT') target = commentsMap[key] || null;

      return { ...like, target };
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('Error fetching likes:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des likes' });
  }
};

/**
 * GET /api/admin/likes/stats
 * Quelques stats globales (par type, par action, activité 7j)
 */
const getLikesStats = async (req, res) => {
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = await Like.aggregate([
      {
        $facet: {
          byType: [
            { $group: { _id: '$type_entite', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byAction: [
            { $group: { _id: '$type_action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          last7Days: [
            { $match: { creation_date: { $gte: d7 } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$creation_date' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]);

    return res.json({ success: true, data: stats[0] || {} });
  } catch (error) {
    console.error('Error getting likes stats:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des statistiques' });
  }
};

/**
 * GET /api/admin/likes/:id
 */
const getLikeDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const like = await Like.findById(id)
      .populate('utilisateur', 'nom prenom email photo_profil')
      .lean();

    if (!like) {
      return res.status(404).json({ success: false, message: 'Like introuvable' });
    }

    let target = null;
    if (like.type_entite === 'VIDEO') {
      target = await Video.findById(like.entite_id).select('titre artiste type').lean();
    } else if (like.type_entite === 'POST') {
      target = await Post.findById(like.entite_id).select('contenu type_media').lean();
    } else if (like.type_entite === 'COMMENT') {
      target = await Comment.findById(like.entite_id).select('contenu auteur').populate('auteur','nom prenom').lean();
    }

    return res.json({ success: true, data: { ...like, target } });
  } catch (error) {
    console.error('Error getting like details:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération du like' });
  }
};

/**
 * DELETE /api/admin/likes/:id
 */
const deleteLike = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const result = await Like.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Like introuvable' });
    }

    return res.json({ success: true, message: 'Like supprimé' });
  } catch (error) {
    console.error('Error deleting like:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
};

/**
 * DELETE /api/admin/likes/bulk
 * Body: { likeIds: string[] }
 */
const bulkDeleteLikes = async (req, res) => {
  try {
    const { likeIds } = req.body || {};
    if (!Array.isArray(likeIds) || likeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Liste d’IDs invalide' });
    }

    const ids = likeIds.filter(isObjectId);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'Aucun ID valide' });
    }

    const { deletedCount } = await Like.deleteMany({ _id: { $in: ids } });
    return res.json({ success: true, message: 'Suppression en lot effectuée', data: { deletedCount } });
  } catch (error) {
    console.error('Error bulk deleting likes:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression en lot' });
  }
};

module.exports = {
  getAllLikes,
  getLikesStats,
  getLikeDetails,
  deleteLike,
  bulkDeleteLikes
};
