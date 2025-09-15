// routes/api/admin/posts.js
const express = require('express');
const router = express.Router();
const adminPostController = require('../../controllers/adminPostController');
const commentController = require('../../controllers/commentController');
const { isAdmin, isSuperAdmin } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

// ========================================
// Routes pour les statistiques admin
// ========================================

/**
 * @route   GET /api/admin/posts/stats
 * @desc    Récupérer les statistiques de modération des posts
 * @access  Private (Admin)
 */
router.get('/stats', isAdmin, adminPostController.getModerationStats);

// ========================================
// Routes pour la gestion des posts
// ========================================

/**
 * @route   GET /api/admin/posts
 * @desc    Récupérer tous les posts avec filtres admin
 * @access  Private (Admin)
 */
router.get('/', isAdmin, adminPostController.getAllPosts);

/**
 * @route   GET /api/admin/posts/:id
 * @desc    Récupérer un post avec détails complets (admin)
 * @access  Private (Admin)
 */
router.get('/:id', isAdmin, adminPostController.getPostDetails);

/**
 * @route   PUT /api/admin/posts/:id/moderate
 * @desc    Modérer un post
 * @access  Private (Admin)
 */
router.put('/:id/moderate', 
  isAdmin,
  logAction('MODERATION_POST_ADMIN', 'Modération d\'un post par admin'),
  adminPostController.moderatePost
);

/**
 * @route   PUT /api/admin/posts/:id/restore
 * @desc    Restaurer un post (retirer la modération)
 * @access  Private (Admin)
 */
router.put('/:id/restore',
  isAdmin,
  logAction('RESTAURATION_POST_ADMIN', 'Restauration d\'un post par admin'),
  adminPostController.restorePost
);

/**
 * @route   DELETE /api/admin/posts/:id
 * @desc    Supprimer définitivement un post (admin)
 * @access  Private (Admin)
 */
router.delete('/:id',
  isAdmin,
  logAction('SUPPRESSION_DEFINITIVE_POST', 'Suppression définitive d\'un post par admin'),
  adminPostController.deletePost
);

/**
 * @route   POST /api/admin/posts/bulk-action
 * @desc    Actions en masse sur les posts
 * @access  Private (Admin)
 */
router.post('/bulk-action',
  isAdmin,
  logAction('ACTION_MASSE_POSTS', 'Action en masse sur des posts'),
  adminPostController.bulkAction
);

// ========================================
// Routes pour la gestion des commentaires (admin)
// ========================================

/**
 * @route   GET /api/admin/posts/:postId/comments
 * @desc    Récupérer tous les commentaires d'un post (vue admin)
 * @access  Private (Admin)
 */
router.get('/:postId/comments', isAdmin, async (req, res, next) => {
  // Modifier temporairement req.user pour bypasser les restrictions de visibilité
  req.originalUser = req.user;
  req.bypassVisibility = true;
  next();
}, commentController.getPostComments);

/**
 * @route   DELETE /api/admin/posts/:postId/comments/:commentId
 * @desc    Supprimer un commentaire (admin)
 * @access  Private (Admin)
 */
router.delete('/:postId/comments/:commentId',
  isAdmin,
  logAction('SUPPRESSION_COMMENTAIRE_ADMIN', 'Suppression d\'un commentaire par admin'),
  async (req, res, next) => {
    // Passer l'ID du commentaire en paramètre
    req.params.commentId = req.params.commentId;
    next();
  },
  commentController.deleteComment
);

/**
 * @route   PUT /api/admin/posts/:postId/comments/:commentId/moderate
 * @desc    Modérer un commentaire
 * @access  Private (Admin)
 */
router.put('/:postId/comments/:commentId/moderate',
  isAdmin,
  logAction('MODERATION_COMMENTAIRE_ADMIN', 'Modération d\'un commentaire par admin'),
  async (req, res) => {
    try {
      const { commentId } = req.params;
      const { raison_moderation } = req.body;
      
      const Comment = require('../../../models/Comment');
      const comment = await Comment.findById(commentId);
      
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Commentaire non trouvé'
        });
      }
      
      comment.statut = 'MODERE';
      comment.raison_moderation = raison_moderation || 'Modéré par un administrateur';
      comment.modified_by = req.user.id;
      comment.modified_date = Date.now();
      
      await comment.save();
      
      res.status(200).json({
        success: true,
        message: 'Commentaire modéré avec succès',
        data: comment
      });
    } catch (error) {
      console.error('Erreur lors de la modération du commentaire:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modération du commentaire'
      });
    }
  }
);

/**
 * @route   PUT /api/admin/posts/:postId/comments/:commentId/restore
 * @desc    Restaurer un commentaire modéré
 * @access  Private (Admin)
 */
router.put('/:postId/comments/:commentId/restore',
  isAdmin,
  logAction('RESTAURATION_COMMENTAIRE_ADMIN', 'Restauration d\'un commentaire par admin'),
  async (req, res) => {
    try {
      const { commentId } = req.params;
      
      const Comment = require('../../../models/Comment');
      const comment = await Comment.findById(commentId);
      
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Commentaire non trouvé'
        });
      }
      
      comment.statut = 'ACTIF';
      comment.raison_moderation = '';
      comment.modified_by = req.user.id;
      comment.modified_date = Date.now();
      
      await comment.save();
      
      res.status(200).json({
        success: true,
        message: 'Commentaire restauré avec succès',
        data: comment
      });
    } catch (error) {
      console.error('Erreur lors de la restauration du commentaire:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la restauration du commentaire'
      });
    }
  }
);

// ========================================
// Routes pour les signalements
// ========================================

/**
 * @route   GET /api/admin/posts/reports/summary
 * @desc    Récupérer un résumé des signalements
 * @access  Private (Admin)
 */
router.get('/reports/summary', isAdmin, async (req, res) => {
  try {
    const Post = require('../../../models/Post');
    const Comment = require('../../../models/Comment');
    
    // Statistiques des signalements de posts
    const reportedPosts = await Post.aggregate([
      {
        $match: {
          'signalements.0': { $exists: true }
        }
      },
      {
        $project: {
          _id: 1,
          contenu: 1,
          auteur: 1,
          signalements: 1,
          modere: 1,
          createdAt: 1,
          reportCount: { $size: '$signalements' }
        }
      },
      {
        $sort: { reportCount: -1, createdAt: -1 }
      },
      {
        $limit: 20
      }
    ]);
    
    // Statistiques des signalements de commentaires
    const reportedComments = await Comment.aggregate([
      {
        $match: {
          'signale_par.0': { $exists: true }
        }
      },
      {
        $project: {
          _id: 1,
          contenu: 1,
          auteur: 1,
          signale_par: 1,
          statut: 1,
          creation_date: 1,
          reportCount: { $size: '$signale_par' }
        }
      },
      {
        $sort: { reportCount: -1, creation_date: -1 }
      },
      {
        $limit: 20
      }
    ]);
    
    // Compter les totaux
    const totalReportedPosts = await Post.countDocuments({
      'signalements.0': { $exists: true }
    });
    
    const totalReportedComments = await Comment.countDocuments({
      'signale_par.0': { $exists: true }
    });
    
    res.status(200).json({
      success: true,
      data: {
        posts: {
          items: reportedPosts,
          total: totalReportedPosts
        },
        comments: {
          items: reportedComments,
          total: totalReportedComments
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des signalements:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des signalements'
    });
  }
});

/**
 * @route   POST /api/admin/posts/:id/dismiss-reports
 * @desc    Rejeter tous les signalements d'un post
 * @access  Private (Admin)
 */
router.post('/:id/dismiss-reports',
  isAdmin,
  logAction('REJET_SIGNALEMENTS_POST', 'Rejet des signalements d\'un post'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const Post = require('../../../models/Post');
      const post = await Post.findById(id);
      
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post non trouvé'
        });
      }
      
      // Vider les signalements
      post.signalements = [];
      post.modified_by = req.user.id;
      
      await post.save();
      
      res.status(200).json({
        success: true,
        message: 'Signalements rejetés avec succès'
      });
    } catch (error) {
      console.error('Erreur lors du rejet des signalements:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du rejet des signalements'
      });
    }
  }
);

// ========================================
// Routes pour les exports et rapports
// ========================================

/**
 * @route   GET /api/admin/posts/export/csv
 * @desc    Exporter les données des posts en CSV
 * @access  Private (SuperAdmin)
 */
router.get('/export/csv', isSuperAdmin, async (req, res) => {
  try {
    const Post = require('../../../models/Post');
    
    const posts = await Post.find({})
      .populate('auteur', 'nom prenom email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Préparer les données pour le CSV
    const csvData = posts.map(post => ({
      id: post._id,
      contenu: post.contenu?.replace(/["\n\r]/g, ' ') || '',
      auteur: `${post.auteur?.prenom || ''} ${post.auteur?.nom || ''}`.trim(),
      email_auteur: post.auteur?.email || '',
      visibilite: post.visibilite,
      type_media: post.type_media,
      modere: post.modere ? 'Oui' : 'Non',
      nb_likes: post.likes?.length || 0,
      nb_commentaires: post.commentaires?.length || 0,
      nb_signalements: post.signalements?.length || 0,
      date_creation: post.createdAt,
      date_modification: post.updatedAt
    }));
    
    // Générer l'en-tête CSV
    const headers = Object.keys(csvData[0]).join(',');
    const csvContent = [
      headers,
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="posts_export_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Erreur lors de l\'export CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export CSV'
    });
  }
});

module.exports = router;