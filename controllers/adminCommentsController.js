// controllers/adminCommentsController.js
const Comment = require('../models/Comment');
const Post = require("../models/Post");
const Video = require('../models/Video');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Obtenir tous les commentaires avec filtres (admin)
 * @route   GET /api/admin/comments
 * @access  Private/Admin
 */
exports.getAllComments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = 'all',
      type = 'all', // all, video, post
      sortBy = 'recent',
      userId = null,
      reported = 'all' // all, reported, not_reported
    } = req.query;

    // Construction du filtre
    const filter = {};
    
    // Filtre par statut
    if (status !== 'all') {
      filter.statut = status.toUpperCase();
    }
    
    // Filtre par type (vidéo ou post)
    if (type === 'video') {
      filter.video_id = { $exists: true };
      filter.post_id = { $exists: false };
    } else if (type === 'post') {
      filter.post_id = { $exists: true };
      filter.video_id = { $exists: false };
    }
    
    // Filtre par utilisateur spécifique
    if (userId) {
      filter.auteur = userId;
    }
    
    // Filtre par commentaires signalés
    if (reported === 'reported') {
      filter['signale_par.0'] = { $exists: true };
    } else if (reported === 'not_reported') {
      filter['signale_par.0'] = { $exists: false };
    }
    
    // Recherche textuelle
    if (search.trim()) {
      filter.$or = [
        { contenu: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Options de tri
    let sortOptions;
    switch (sortBy) {
      case 'oldest':
        sortOptions = { creation_date: 1 };
        break;
      case 'most_liked':
        sortOptions = { likes: -1, creation_date: -1 };
        break;
      case 'most_reported':
        sortOptions = { 'signale_par': -1, creation_date: -1 };
        break;
      case 'recent':
      default:
        sortOptions = { creation_date: -1 };
        break;
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Comment.countDocuments(filter);
    
    // Récupération des commentaires
    const comments = await Comment.find(filter)
      .populate('auteur', 'nom prenom email photo_profil statut_compte')
      .populate('video_id', 'titre artiste type')
      .populate('post_id', 'contenu type_media')
      .populate('parent_comment', 'contenu auteur')
      .populate('signale_par.utilisateur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Calculer les statistiques
    const stats = await Comment.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$statut', count: { $sum: 1 } } }
          ],
          byType: [
            {
              $project: {
                type: {
                  $cond: [
                    { $ifNull: ['$video_id', false] },
                    'video',
                    { $cond: [{ $ifNull: ['$post_id', false] }, 'post', 'other'] }
                  ]
                }
              }
            },
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          reported: [
            {
              $project: {
                isReported: {
                  $cond: [{ $gt: [{ $size: { $ifNull: ['$signale_par', []] } }, 0] }, 1, 0]
                }
              }
            },
            { $group: { _id: '$isReported', count: { $sum: 1 } } }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    res.json({
      success: true,
      data: comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error fetching admin comments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commentaires'
    });
  }
};

/**
 * @desc    Obtenir les détails d'un commentaire (admin)
 * @route   GET /api/admin/comments/:id
 * @access  Private/Admin
 */
exports.getCommentDetails = async (req, res) => {
  try {
    const commentId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de commentaire invalide'
      });
    }
    
    const comment = await Comment.findById(commentId)
      .populate('auteur', 'nom prenom email photo_profil statut_compte date_inscription')
      .populate('video_id', 'titre artiste type youtubeUrl')
      .populate('post_id', 'contenu type_media media')
      .populate('parent_comment')
      .populate('signale_par.utilisateur', 'nom prenom email')
      .lean();
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Commentaire non trouvé'
      });
    }
    
    // Récupérer les réponses si c'est un commentaire parent
    let replies = [];
    if (!comment.parent_comment) {
      replies = await Comment.find({ parent_comment: commentId })
        .populate('auteur', 'nom prenom photo_profil')
        .sort({ creation_date: 1 })
        .lean();
    }
    
    // Récupérer l'historique des actions sur ce commentaire
    const history = await LogAction.find({
      $or: [
        { 'donnees_supplementaires.comment_id': commentId },
        { 'donnees_supplementaires.memoire_id': commentId }
      ]
    })
    .populate('id_user', 'nom prenom')
    .sort({ creation_date: -1 })
    .limit(10)
    .lean();
    
    res.json({
      success: true,
      data: {
        comment,
        replies,
        history
      }
    });
  } catch (error) {
    console.error('Error fetching comment details:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des détails du commentaire'
    });
  }
};

/**
 * @desc    Modérer un commentaire (approuver/rejeter/supprimer)
 * @route   PUT /api/admin/comments/:id/moderate
 * @access  Private/Admin
 */
exports.moderateComment = async (req, res) => {
  try {
    const commentId = req.params.id;
    const { action, reason } = req.body; // action: 'approve', 'reject', 'delete'
    
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de commentaire invalide'
      });
    }
    
    if (!['approve', 'reject', 'delete'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide'
      });
    }
    
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Commentaire non trouvé'
      });
    }
    
    let newStatus;
    let actionDescription;
    
    switch (action) {
      case 'approve':
        newStatus = 'ACTIF';
        actionDescription = 'Commentaire approuvé';
        break;
      case 'reject':
        newStatus = 'MODERE';
        actionDescription = 'Commentaire rejeté pour modération';
        break;
      case 'delete':
        newStatus = 'SUPPRIME';
        actionDescription = 'Commentaire supprimé';
        break;
    }
    
    // Mettre à jour le commentaire
    comment.statut = newStatus;
    comment.modified_date = Date.now();
    comment.modified_by = req.user.id;
    
    // Si c'est une suppression, supprimer aussi les réponses
    if (action === 'delete' && !comment.parent_comment) {
      await Comment.updateMany(
        { parent_comment: commentId },
        {
          statut: 'SUPPRIME',
          modified_date: Date.now(),
          modified_by: req.user.id
        }
      );
    }
    
    await comment.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'MODERATION_COMMENTAIRE',
      description_action: actionDescription + (reason ? ` - Raison: ${reason}` : ''),
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        comment_id: commentId,
        action,
        reason,
        old_status: comment.statut,
        new_status: newStatus
      }
    });
    
    res.json({
      success: true,
      message: actionDescription,
      data: {
        commentId,
        newStatus,
        action
      }
    });
  } catch (error) {
    console.error('Error moderating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modération du commentaire'
    });
  }
};

/**
 * @desc    Modération en lot
 * @route   PUT /api/admin/comments/bulk-moderate
 * @access  Private/Admin
 */
exports.bulkModerateComments = async (req, res) => {
  try {
    const { commentIds, action, reason } = req.body;
    
    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste des IDs de commentaires requise'
      });
    }
    
    if (!['approve', 'reject', 'delete'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide'
      });
    }
    
    let newStatus;
    switch (action) {
      case 'approve': newStatus = 'ACTIF'; break;
      case 'reject': newStatus = 'MODERE'; break;
      case 'delete': newStatus = 'SUPPRIME'; break;
    }
    
    // Mettre à jour les commentaires
    const result = await Comment.updateMany(
      { _id: { $in: commentIds } },
      {
        statut: newStatus,
        modified_date: Date.now(),
        modified_by: req.user.id
      }
    );
    
    // Si suppression, supprimer aussi les réponses
    if (action === 'delete') {
      await Comment.updateMany(
        { parent_comment: { $in: commentIds } },
        {
          statut: 'SUPPRIME',
          modified_date: Date.now(),
          modified_by: req.user.id
        }
      );
    }
    
    // Journaliser les actions
    for (const commentId of commentIds) {
      await LogAction.create({
        type_action: 'MODERATION_COMMENTAIRE_LOT',
        description_action: `Modération en lot: ${action}` + (reason ? ` - ${reason}` : ''),
        id_user: req.user.id,
        created_by: req.user.id,
        donnees_supplementaires: {
          comment_id: commentId,
          action,
          reason,
          bulk_operation: true
        }
      });
    }
    
    res.json({
      success: true,
      message: `${result.modifiedCount} commentaires modérés`,
      data: {
        modifiedCount: result.modifiedCount,
        action,
        newStatus
      }
    });
  } catch (error) {
    console.error('Error bulk moderating comments:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modération en lot'
    });
  }
};

/**
 * @desc    Obtenir les statistiques des commentaires
 * @route   GET /api/admin/comments/stats
 * @access  Private/Admin
 */
exports.getCommentsStats = async (req, res) => {
  try {
    const stats = await Comment.aggregate([
      {
        $facet: {
          // Stats par statut
          byStatus: [
            { $group: { _id: '$statut', count: { $sum: 1 } } }
          ],
          // Stats par type (vidéo/post)
          byType: [
            {
              $project: {
                type: {
                  $cond: [
                    { $ifNull: ['$video_id', false] },
                    'video',
                    { $cond: [{ $ifNull: ['$post_id', false] }, 'post', 'memory'] }
                  ]
                }
              }
            },
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          // Stats par période (7 derniers jours)
          byDate: [
            {
              $match: {
                creation_date: {
                  $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$creation_date'
                  }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { '_id': 1 } }
          ],
          // Commentaires les plus signalés
          mostReported: [
            {
              $match: {
                'signale_par.0': { $exists: true }
              }
            },
            {
              $addFields: {
                reportCount: { $size: '$signale_par' }
              }
            },
            { $sort: { reportCount: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'users',
                localField: 'auteur',
                foreignField: '_id',
                as: 'auteur'
              }
            },
            { $unwind: '$auteur' }
          ],
          // Total
          total: [{ $count: 'total' }]
        }
      }
    ]);
    
    // Stats des utilisateurs les plus actifs en commentaires
    const topCommenters = await Comment.aggregate([
      { $match: { statut: 'ACTIF' } },
      { $group: { _id: '$auteur', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          user: { nom: 1, prenom: 1, photo_profil: 1 },
          commentCount: '$count'
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        ...stats[0],
        topCommenters
      }
    });
  } catch (error) {
    console.error('Error fetching comments stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

/**
 * @desc    Répondre à un commentaire (en tant qu'admin)
 * @route   POST /api/admin/comments/:id/reply
 * @access  Private/Admin
 */
exports.replyToComment = async (req, res) => {
  try {
    const commentId = req.params.id;
    const { contenu } = req.body;
    
    if (!contenu || !contenu.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le contenu de la réponse est requis'
      });
    }
    
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Commentaire parent non trouvé'
      });
    }
    
    // Créer la réponse
    const reply = await Comment.create({
      contenu: contenu.trim(),
      video_id: parentComment.video_id,
      post_id: parentComment.post_id,
      auteur: req.user.id,
      parent_comment: commentId,
      statut: 'ACTIF',
      created_by: req.user.id
    });
    
    await reply.populate('auteur', 'nom prenom photo_profil');
    
    // Journaliser
    await LogAction.create({
      type_action: 'REPONSE_ADMIN_COMMENTAIRE',
      description_action: 'Réponse admin à un commentaire',
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        parent_comment_id: commentId,
        reply_id: reply._id
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Réponse ajoutée avec succès',
      data: reply
    });
  } catch (error) {
    console.error('Error replying to comment:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout de la réponse'
    });
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