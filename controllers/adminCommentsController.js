// controllers/adminCommentsController.js
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Video = require('../models/Video');
const Podcast = require('../models/Podcast'); // NEW
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Obtenir tous les commentaires avec filtres (admin)
 * @route   GET /api/admin/comments
 * @access  Private/Admin
 */
const getAllComments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'all',
      type = 'all',
      sortBy = 'recent',
      search = '',
      minLikes,
      minReports
    } = req.query;

    const filter = {};

    // Statut
    if (status && status !== 'all') {
      filter.statut = status;
    }

    // Type
    if (type === 'video') {
      filter.video_id = { $exists: true };
    } else if (type === 'post') {
      filter.post_id = { $exists: true };
    } else if (type === 'podcast') {
      filter.podcast_id = { $exists: true };
    }

    // Recherche
    if (search) {
      filter.$or = [
        { contenu: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Min likes / reports
    if (minLikes) filter.likes = { $gte: Number(minLikes) };
    if (minReports) filter['signale_par.0'] = { $exists: true }; // présence >=1

    // Tri
    let sortOptions;
    switch (sortBy) {
      case 'oldest':
        sortOptions = { createdAt: 1, creation_date: 1 };
        break;
      case 'most_liked':
        sortOptions = { likes: -1, createdAt: -1, creation_date: -1 };
        break;
      case 'most_reported':
        sortOptions = { 'signale_par': -1, createdAt: -1, creation_date: -1 };
        break;
      case 'recent':
      default:
        sortOptions = { createdAt: -1, creation_date: -1 };
        break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await Comment.find(filter)
      .populate('auteur', 'nom prenom email photo_profil statut_compte username')
      .populate('video_id', 'titre artiste type')
      .populate('post_id', 'contenu type_media')
      .populate('podcast_id', 'titre title nom auteur host cover image') // NEW
      .populate('parent_comment', 'contenu auteur')
      .populate('signale_par.utilisateur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Comment.countDocuments(filter);

    res.json({
      success: true,
      data: comments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('getAllComments error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commentaires'
    });
  }
};

/**
 * @desc    Détails d'un commentaire
 * @route   GET /api/admin/comments/:id
 * @access  Private/Admin
 */
const getCommentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const comment = await Comment.findById(id)
      .populate('auteur', 'nom prenom email photo_profil username')
      .populate('video_id', 'titre artiste type')
      .populate('post_id', 'contenu type_media')
      .populate('podcast_id', 'titre title nom auteur host cover image') // NEW
      .populate('parent_comment', 'contenu auteur')
      .populate('signale_par.utilisateur', 'nom prenom')
      .lean();

    if (!comment) {
      return res.status(404).json({ success: false, message: 'Commentaire introuvable' });
    }

    res.json({ success: true, data: comment });
  } catch (error) {
    console.error('getCommentDetails error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération du commentaire' });
  }
};

/**
 * @desc    Modérer un commentaire
 * @route   PUT /api/admin/comments/:id/moderate
 * @access  Private/Admin
 */
const moderateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, raison } = req.body;

    const allowed = ['ACTIF', 'SUPPRIME', 'EN_ATTENTE'];
    if (statut && !allowed.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const updated = await Comment.findByIdAndUpdate(
      id,
      { ...(statut ? { statut } : {}), ...(raison ? { raison_moderation: raison } : {}) },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Commentaire introuvable' });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('moderateComment error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la modération' });
  }
};

/**
 * @desc    Modération en masse
 * @route   PUT /api/admin/comments/bulk-moderate
 * @access  Private/Admin
 */
const bulkModerateComments = async (req, res) => {
  try {
    const { ids = [], statut } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun ID fourni' });
    }
    const allowed = ['ACTIF', 'SUPPRIME', 'EN_ATTENTE'];
    if (!allowed.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    await Comment.updateMany(
      { _id: { $in: ids } },
      { $set: { statut } }
    );

    res.json({ success: true, data: { count: ids.length } });
  } catch (error) {
    console.error('bulkModerateComments error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la modération en masse' });
  }
};

/**
 * @desc    Statistiques commentaires
 * @route   GET /api/admin/comments/stats
 * @access  Private/Admin
 */
const getCommentsStats = async (req, res) => {
  try {
    const basePipeline = [];

    // Répartition par statut
    const byStatus = await Comment.aggregate([
      ...basePipeline,
      { $group: { _id: '$statut', count: { $sum: 1 } } }
    ]);

    // Répartition par type (video/post/podcast/autres)
    const byType = await Comment.aggregate([
      ...basePipeline,
      {
        $project: {
          type: {
            $cond: [
              { $ifNull: ['$video_id', false] }, 'video',
              {
                $cond: [
                  { $ifNull: ['$post_id', false] }, 'post',
                  {
                    $cond: [
                      { $ifNull: ['$podcast_id', false] }, 'podcast', 'other'
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const total = await Comment.countDocuments();

    res.json({
      success: true,
      data: {
        total,
        byStatus,
        byType
      }
    });
  } catch (error) {
    console.error('getCommentsStats error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des statistiques' });
  }
};

/**
 * @desc    Répondre à un commentaire (admin)
 * @route   POST /api/admin/comments/:id/reply
 * @access  Private/Admin
 */
const replyToComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { contenu } = req.body;

    if (!contenu || !contenu.trim()) {
      return res.status(400).json({ success: false, message: 'Contenu requis' });
    }

    const parent = await Comment.findById(id).lean();
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Commentaire introuvable' });
    }

    const reply = await Comment.create({
      contenu: contenu.trim(),
      video_id: parent.video_id,
      post_id: parent.post_id,
      podcast_id: parent.podcast_id, // NEW (propagation)
      auteur: req.user?.id || req.user?._id,
      parent_comment: id,
      statut: 'ACTIF',
      created_by: req.user?.id || req.user?._id
    });

    res.status(201).json({ success: true, data: reply });
  } catch (error) {
    console.error('replyToComment error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'ajout de la réponse' });
  }
};

module.exports = {
  getAllComments,
  getCommentDetails,
  moderateComment,
  bulkModerateComments,
  getCommentsStats,
  replyToComment
};
