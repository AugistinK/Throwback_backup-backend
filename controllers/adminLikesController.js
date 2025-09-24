// controllers/adminLikesController.js
const mongoose = require('mongoose');

// ⚠️ Ajuste ces chemins si besoin (../ vs ./)
const Like     = require('../models/Like');
const Video    = require('../models/Video');
const Post     = require('../models/Post');
const Comment  = require('../models/Comment');
const Memory   = require('../models/Memory');   // contient 'contenu' :contentReference[oaicite:1]{index=1}
const Playlist = require('../models/Playlist'); // contient 'nom'/'description' :contentReference[oaicite:2]{index=2}
const Podcast  = require('../models/Podcast');  // contient 'title'/'hostName'/'guestName'/'description' :contentReference[oaicite:3]{index=3}

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);
const toEnum = (v = '') => v.toString().trim().toUpperCase();

// normalise les types acceptant singulier/pluriel
const normalizeType = (t = 'all') => {
  const x = toEnum(t);
  const map = {
    VIDEOS: 'VIDEO', VIDEO: 'VIDEO',
    POSTS: 'POST', POST: 'POST',
    COMMENTS: 'COMMENT', COMMENT: 'COMMENT',
    MEMORIES: 'MEMORY', MEMORY: 'MEMORY',
    PLAYLISTS: 'PLAYLIST', PLAYLIST: 'PLAYLIST',
    PODCASTS: 'PODCAST', PODCAST: 'PODCAST',
    ALL: 'ALL'
  };
  return map[x] || x;
};

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
      type = 'all',           // all|video|post|comment|memory|playlist|podcast (+ pluriels)
      targetId = '',
      dateFrom = '',
      dateTo = '',
      action = 'all',         // all|like|dislike
      sortBy = 'recent'       // recent|oldest|most_active
    } = req.query;

    const filter = {};

    // Filtres de base
    const normType = normalizeType(type);
    if (normType !== 'ALL') filter.type_entite = normType;
    if (action && action !== 'all') filter.type_action = toEnum(action);
    if (userId && isObjectId(userId)) filter.utilisateur = userId;
    if (targetId && isObjectId(targetId)) filter.entite_id = targetId;

    if (dateFrom || dateTo) {
      filter.creation_date = {};
      if (dateFrom) filter.creation_date.$gte = new Date(dateFrom);
      if (dateTo)   filter.creation_date.$lte = new Date(dateTo);
    }

    // Recherche étendue (user + entités)
    if (search && search.trim()) {
      const q = search.trim();
      const re = new RegExp(q, 'i');

      // si l'input ressemble à un ObjectId, on l’ajoute dans l’OR direct
      const maybeId = isObjectId(q) ? new mongoose.Types.ObjectId(q) : null;

      // Pré-résolution des IDs par type (titre/contenu/nom…)
      const [videos, posts, comments, memories, playlists, podcasts, users] = await Promise.all([
        Video.find({ $or: [{ titre: re }, { artiste: re }] }).select('_id').lean(),
        Post.find({ $or: [{ contenu: re }, { hashtags: re }] }).select('_id').lean(), // Post.contenu :contentReference[oaicite:4]{index=4}
        Comment.find({ contenu: re }).select('_id').lean(),
        Memory.find({ contenu: re }).select('_id').lean(),                              // Memory.contenu :contentReference[oaicite:5]{index=5}
        Playlist.find({ $or: [{ nom: re }, { description: re }] }).select('_id').lean(),// Playlist.nom/description :contentReference[oaicite:6]{index=6}
        Podcast.find({ $or: [{ title: re }, { hostName: re }, { guestName: re }, { description: re }] }).select('_id').lean(), // Podcast.title… :contentReference[oaicite:7]{index=7}
        // recherche utilisateur
        mongoose.model('User').find({ $or: [{ nom: re }, { prenom: re }, { email: re }] }).select('_id').lean(),
      ]);

      const toIds = (arr) => arr.map(x => x._id);
      const or = [
        { type_entite: re },
        { type_action: re },
      ];
      if (users.length)    or.push({ utilisateur: { $in: toIds(users) } });
      if (videos.length)   or.push({ $and: [{ type_entite: 'VIDEO' },   { entite_id: { $in: toIds(videos) } }] });
      if (posts.length)    or.push({ $and: [{ type_entite: 'POST' },    { entite_id: { $in: toIds(posts) } }] });
      if (comments.length) or.push({ $and: [{ type_entite: 'COMMENT' }, { entite_id: { $in: toIds(comments) } }] });
      if (memories.length) or.push({ $and: [{ type_entite: 'MEMORY' },  { entite_id: { $in: toIds(memories) } }] });
      if (playlists.length)or.push({ $and: [{ type_entite: 'PLAYLIST' },{ entite_id: { $in: toIds(playlists) } }] });
      if (podcasts.length) or.push({ $and: [{ type_entite: 'PODCAST' }, { entite_id: { $in: toIds(podcasts) } }] });
      if (maybeId)         or.push({ entite_id: maybeId });

      filter.$or = or;
    }

    // Tri
    let sort = { creation_date: -1 };
    if (sortBy === 'oldest') sort = { creation_date: 1 };
    if (sortBy === 'most_active') sort = { type_entite: 1, entite_id: 1, creation_date: -1 };

    const pageNum  = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip     = (pageNum - 1) * limitNum;

    const total = await Like.countDocuments(filter);

    // Récupération brute
    const likes = await Like.find(filter)
      .populate('utilisateur', 'nom prenom email photo_profil')
      // compat: si ton schema Like a encore ces refs spécifiques, on en profite
      .populate('video_id', 'titre artiste type')
      .populate('post_id', 'contenu type_media')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Collecte des entite_id par type pour enrichir en 1 requête par type
    const idsByType = {
      VIDEO:    [],
      POST:     [],
      COMMENT:  [],
      MEMORY:   [],
      PLAYLIST: [],
      PODCAST:  [],
    };
    for (const l of likes) {
      if (l.entite_id && idsByType[l.type_entite]) {
        idsByType[l.type_entite].push(l.entite_id);
      }
    }

    const uniq = (arr) => [...new Set(arr.map(id => id?.toString())).values()].filter(Boolean);

    const [
      videosMap, postsMap, commentsMap, memoriesMap, playlistsMap, podcastsMap
    ] = await Promise.all([
      (async () => {
        const ids = uniq(idsByType.VIDEO);
        if (!ids.length) return {};
        const arr = await Video.find({ _id: { $in: ids } }).select('titre artiste type').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        const ids = uniq(idsByType.POST);
        if (!ids.length) return {};
        const arr = await Post.find({ _id: { $in: ids } }).select('contenu type_media').lean(); // Post.contenu :contentReference[oaicite:8]{index=8}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        const ids = uniq(idsByType.COMMENT);
        if (!ids.length) return {};
        const arr = await Comment.find({ _id: { $in: ids } }).select('contenu auteur').populate('auteur','nom prenom').lean();
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        const ids = uniq(idsByType.MEMORY);
        if (!ids.length) return {};
        const arr = await Memory.find({ _id: { $in: ids } }).select('contenu').lean();          // Memory.contenu :contentReference[oaicite:9]{index=9}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        const ids = uniq(idsByType.PLAYLIST);
        if (!ids.length) return {};
        const arr = await Playlist.find({ _id: { $in: ids } }).select('nom description').lean(); // Playlist.nom/description :contentReference[oaicite:10]{index=10}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
      (async () => {
        const ids = uniq(idsByType.PODCAST);
        if (!ids.length) return {};
        const arr = await Podcast.find({ _id: { $in: ids } }).select('title hostName guestName description').lean(); // Podcast.title… :contentReference[oaicite:11]{index=11}
        return Object.fromEntries(arr.map(x => [x._id.toString(), x]));
      })(),
    ]);

    // Construction des lignes (on garde compat vidéo/post si like.video_id/post_id existent)
    const rows = likes.map((l) => {
      const key = l.entite_id?.toString();
      let target = null;

      switch (l.type_entite) {
        case 'VIDEO':
          target = videosMap[key] || l.video_id || null;
          break;
        case 'POST':
          target = postsMap[key] || l.post_id || null;
          break;
        case 'COMMENT':
          target = commentsMap[key] || null;
          break;
        case 'MEMORY':
          target = memoriesMap[key] || null;
          break;
        case 'PLAYLIST':
          target = playlistsMap[key] || null;
          break;
        case 'PODCAST':
          target = podcastsMap[key] || null;
          break;
        default:
          target = null;
      }

      return { ...l, target };
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching likes:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des likes' });
  }
};

/**
 * GET /api/admin/likes/stats
 * byType + série 7 jours
 */
const getLikesStats = async (_req, res) => {
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7 * 86400000);

    const [facet] = await Promise.all([
      Like.aggregate([
        {
          $facet: {
            byType:   [{ $group: { _id: '$type_entite', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            byAction: [{ $group: { _id: '$type_action',  count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            last7Days: [
              { $match: { creation_date: { $gte: d7 } } },
              { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$creation_date' } }, count: { $sum: 1 } } },
              { $sort: { _id: 1 } }
            ],
            total: [{ $count: 'count' }]
          }
        }
      ])
    ]);

    return res.json({ success: true, data: (facet && facet[0]) || {} });
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

    if (!like) return res.status(404).json({ success: false, message: 'Like introuvable' });

    const key = like.entite_id;
    let entity = null;
    if (like.type_entite === 'VIDEO')    entity = await Video.findById(key).select('titre artiste type').lean();
    else if (like.type_entite === 'POST')    entity = await Post.findById(key).select('contenu type_media').lean();       // Post.contenu :contentReference[oaicite:12]{index=12}
    else if (like.type_entite === 'COMMENT') entity = await Comment.findById(key).select('contenu auteur').populate('auteur','nom prenom').lean();
    else if (like.type_entite === 'MEMORY')  entity = await Memory.findById(key).select('contenu').lean();                // Memory.contenu :contentReference[oaicite:13]{index=13}
    else if (like.type_entite === 'PLAYLIST')entity = await Playlist.findById(key).select('nom description').lean();      // Playlist.nom/description :contentReference[oaicite:14]{index=14}
    else if (like.type_entite === 'PODCAST') entity = await Podcast.findById(key).select('title hostName guestName description').lean(); // Podcast.title… :contentReference[oaicite:15]{index=15}

    return res.json({ success: true, data: { ...like, target: entity } });
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

    const like = await Like.findById(id).lean();
    if (!like) return res.status(404).json({ success: false, message: 'Like introuvable' });

    await Like.deleteOne({ _id: id });

    // Optionnel : décrémenter des compteurs si tu en tiens pour VIDEO/COMMENT
    if (like.type_action === 'LIKE') {
      if (like.type_entite === 'VIDEO')   await Video.updateOne({ _id: like.entite_id }, { $inc: { likes: -1 } });
      if (like.type_entite === 'COMMENT') await Comment.updateOne({ _id: like.entite_id }, { $inc: { likes: -1 } });
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
  bulkDeleteLikes,
};
