// controllers/adminLikesController.js
const mongoose = require('mongoose');
const Like = require('../models/Like');
const Video = require('../models/Video');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Memory = require('../models/Memory');
const Playlist = require('../models/Playlist');
const Podcast = require('../models/Podcast');
const User = require('../models/User');

const toEnum = (v) => (v || '').toString().trim().toUpperCase();
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

/**
 * GET /api/admin/likes
 * Query: page,limit,search,userId,type,targetId,dateFrom,dateTo,action,sortBy
 * Types gérés: VIDEO | POST | COMMENT | MEMORY | PLAYLIST | PODCAST
 */
const getAllLikes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      userId = '',
      type = 'all',          // 'all' | 'video' | 'post' | 'comment' | 'memory' | 'playlist' | 'podcast'
      targetId = '',
      dateFrom = '',
      dateTo = '',
      action = 'all',        // 'all' | 'like' | 'dislike'
      sortBy = 'recent'      // 'recent' | 'oldest' | 'most_active'
    } = req.query;

    // ---------- Filtre ----------
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

      // On pré-récupère les IDs correspondants par collection
      const [videos, posts, comments, memories, playlists, podcasts, users] = await Promise.all([
        Video.find({ $or: [{ titre: re }, { artiste: re }] }).select('_id').lean(),
        Post.find({ contenu: re }).select('_id').lean(),
        Comment.find({ contenu: re }).select('_id').lean(),
        Memory.find({ contenu: re }).select('_id').lean(),               // Memory.contenu :contentReference[oaicite:0]{index=0}
        Playlist.find({ $or: [{ nom: re }, { description: re }] }).select('_id').lean(), // Playlist.nom/description :contentReference[oaicite:1]{index=1}
        Podcast.find({ $or: [{ title: re }, { hostName: re }, { guestName: re }, { description: re }] }).select('_id').lean(), // Podcast.title/hostName… :contentReference[oaicite:2]{index=2}
        User.find({ $or: [{ nom: re }, { prenom: re }, { email: re }] }).select('_id').lean()
      ]);

      const vIds = videos.map(x => x._id);
      const pIds = posts.map(x => x._id);
      const cIds = comments.map(x => x._id);
      const mIds = memories.map(x => x._id);
      const plIds = playlists.map(x => x._id);
      const pcIds = podcasts.map(x => x._id);
      const uIds = users.map(x => x._id);

      const or = [
        { type_entite: re },
        { type_action: re },
      ];
      if (uIds.length)  or.push({ utilisateur: { $in: uIds } });
      if (vIds.length)  or.push({ $and: [{ type_entite: 'VIDEO' },   { entite_id: { $in: vIds } }] });
      if (pIds.length)  or.push({ $and: [{ type_entite: 'POST' },    { entite_id: { $in: pIds } }] });
      if (cIds.length)  or.push({ $and: [{ type_entite: 'COMMENT' }, { entite_id: { $in: cIds } }] });
      if (mIds.length)  or.push({ $and: [{ type_entite: 'MEMORY' },  { entite_id: { $in: mIds } }] });
      if (plIds.length) or.push({ $and: [{ type_entite: 'PLAYLIST' },{ entite_id: { $in: plIds } }] });
      if (pcIds.length) or.push({ $and: [{ type_entite: 'PODCAST' }, { entite_id: { $in: pcIds } }] });

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
    const idsByType = {
      VIDEO:   likes.filter(l => l.type_entite === 'VIDEO').map(l => l.entite_id).filter(Boolean),
      POST:    likes.filter(l => l.type_entite === 'POST').map(l => l.entite_id).filter(Boolean),
      COMMENT: likes.filter(l => l.type_entite === 'COMMENT').map(l => l.entite_id).filter(Boolean),
      MEMORY:  likes.filter(l => l.type_entite === 'MEMORY').map(l => l.entite_id).filter(Boolean),
      PLAYLIST:likes.filter(l => l.type_entite === 'PLAYLIST').map(l => l.entite_id).filter(Boolean),
      PODCAST: likes.filter(l => l.type_entite === 'PODCAST').map(l => l.entite_id).filter(Boolean),
    };

    const [
      videosMap, postsMap, commentsMap, memoriesMap, playlistsMap, podcastsMap
    ] = await Promise.all([
      (async () => {
        if (!idsByType.VIDEO.length) return {};
        const arr = await Video.find({ _id: { $in: idsByType.VIDEO } }).select('titre artiste type').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!idsByType.POST.length) return {};
        const arr = await Post.find({ _id: { $in: idsByType.POST } }).select('contenu type_media').lean(); // Post.contenu :contentReference[oaicite:3]{index=3}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!idsByType.COMMENT.length) return {};
        const arr = await Comment.find({ _id: { $in: idsByType.COMMENT } })
          .select('contenu auteur').populate('auteur', 'nom prenom').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!idsByType.MEMORY.length) return {};
        const arr = await Memory.find({ _id: { $in: idsByType.MEMORY } }).select('contenu').lean(); // Memory.contenu :contentReference[oaicite:4]{index=4}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!idsByType.PLAYLIST.length) return {};
        const arr = await Playlist.find({ _id: { $in: idsByType.PLAYLIST } }).select('nom description').lean(); // Playlist.nom/description :contentReference[oaicite:5]{index=5}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        if (!idsByType.PODCAST.length) return {};
        const arr = await Podcast.find({ _id: { $in: idsByType.PODCAST } }).select('title hostName guestName description').lean(); // Podcast.title… :contentReference[oaicite:6]{index=6}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
    ]);

    const rows = likes.map(like => {
      const key = like.entite_id?.toString();
      let target = null;
      switch (like.type_entite) {
        case 'VIDEO':   target = videosMap[key]   || null; break;
        case 'POST':    target = postsMap[key]    || null; break;
        case 'COMMENT': target = commentsMap[key] || null; break;
        case 'MEMORY':  target = memoriesMap[key] || null; break;
        case 'PLAYLIST':target = playlistsMap[key]|| null; break;
        case 'PODCAST': target = podcastsMap[key] || null; break;
        default: break;
      }
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
 */
const getLikesStats = async (req, res) => {
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = await Like.aggregate([
      {
        $facet: {
          byType:   [{ $group: { _id: '$type_entite', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          byAction: [{ $group: { _id: '$type_action', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          last7Days: [
            { $match: { creation_date: { $gte: d7 } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$creation_date' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ],
          total: [{ $count: 'count' }]
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
    const key = like.entite_id;
    if (like.type_entite === 'VIDEO')   target = await Video.findById(key).select('titre artiste type').lean();
    if (like.type_entite === 'POST')    target = await Post.findById(key).select('contenu type_media').lean();     // :contentReference[oaicite:7]{index=7}
    if (like.type_entite === 'COMMENT') target = await Comment.findById(key).select('contenu auteur').populate('auteur','nom prenom').lean();
    if (like.type_entite === 'MEMORY')  target = await Memory.findById(key).select('contenu').lean();              // :contentReference[oaicite:8]{index=8}
    if (like.type_entite === 'PLAYLIST')target = await Playlist.findById(key).select('nom description').lean();    // :contentReference[oaicite:9]{index=9}
    if (like.type_entite === 'PODCAST') target = await Podcast.findById(key).select('title hostName guestName description').lean(); // :contentReference[oaicite:10]{index=10}

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
