// routes/api/adminCommentsRoutes.js
const express = require('express');
const router = express.Router();
const { isAdmin, isSuperAdmin } = require('../../middlewares/authMiddleware'); 
const { logAction } = require('../../middlewares/loggingMiddleware');
const adminCommentsController = require('../../controllers/adminCommentsController');

console.log('🔧 [AdminCommentsRoutes] Chargement des routes admin commentaires...');



/**
 * @route   GET /api/admin/comments/stats
 * @desc    Récupérer les statistiques des commentaires
 * @access  Private (Admin)
 */
router.get('/stats', isAdmin, adminCommentsController.getCommentsStats); 



/**
 * @route   GET /api/admin/comments
 * @desc    Récupérer tous les commentaires avec filtres admin
 * @access  Private (Admin)
 */
router.get('/', isAdmin, adminCommentsController.getAllComments);

/**
 * @route   GET /api/admin/comments/:id
 * @desc    Récupérer les détails d'un commentaire
 * @access  Private (Admin)
 */
router.get('/:id', isAdmin, adminCommentsController.getCommentDetails);

/**
 * @route   PUT /api/admin/comments/:id/moderate
 * @desc    Modérer un commentaire (approuver/rejeter/supprimer)
 * @access  Private (Admin)
 */
router.put('/:id/moderate',
  isAdmin,
  logAction('MODERATION_COMMENTAIRE_ADMIN', 'Modération d\'un commentaire par admin'),
  adminCommentsController.moderateComment
);

/**
 * @route   POST /api/admin/comments/:id/reply
 * @desc    Répondre à un commentaire en tant qu'admin
 * @access  Private (Admin)
 */
router.post('/:id/reply',
  isAdmin,
  logAction('REPONSE_COMMENTAIRE_ADMIN', 'Réponse à un commentaire par admin'),
  adminCommentsController.replyToComment
);


/**
 * @route   PUT /api/admin/comments/bulk-moderate
 * @desc    Modération en lot des commentaires
 * @access  Private (Admin)
 */
router.put('/bulk-moderate',
  isAdmin,
  logAction('MODERATION_MASSE_COMMENTAIRES', 'Modération en masse de commentaires'),
  adminCommentsController.bulkModerateComments
);



/**
 * @route   GET /api/admin/comments/reports/summary
 * @desc    Récupérer un résumé des commentaires signalés
 * @access  Private (Admin)
 */
router.get('/reports/summary', isAdmin, async (req, res) => {
  try {
    const Comment = require('../../models/Comment');
    
    // Statistiques des commentaires signalés
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
          video_id: 1,
          post_id: 1,
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
        $limit: 50
      },
      {
        $lookup: {
          from: 'users',
          localField: 'auteur',
          foreignField: '_id',
          as: 'auteur'
        }
      },
      {
        $lookup: {
          from: 'videos',
          localField: 'video_id',
          foreignField: '_id',
          as: 'video'
        }
      },
      {
        $lookup: {
          from: 'posts',
          localField: 'post_id',
          foreignField: '_id',
          as: 'post'
        }
      }
    ]);
    
    // Compter les totaux
    const totalReported = await Comment.countDocuments({
      'signale_par.0': { $exists: true }
    });
    
    const totalPending = await Comment.countDocuments({
      'signale_par.0': { $exists: true },
      statut: 'SIGNALE'
    });
    
    res.status(200).json({
      success: true,
      data: {
        reportedComments,
        stats: {
          total: totalReported,
          pending: totalPending,
          processed: totalReported - totalPending
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
 * @route   POST /api/admin/comments/:id/dismiss-reports
 * @desc    Rejeter tous les signalements d'un commentaire
 * @access  Private (Admin)
 */
router.post('/:id/dismiss-reports',
  isAdmin,
  logAction('REJET_SIGNALEMENTS_COMMENTAIRE', 'Rejet des signalements d\'un commentaire'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const Comment = require('../../models/Comment');
      const comment = await Comment.findById(id);
      
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Commentaire non trouvé'
        });
      }
      
      // Vider les signalements
      comment.signale_par = [];
      comment.statut = 'ACTIF'; // Remettre en actif
      comment.modified_by = req.user.id;
      comment.modified_date = Date.now();
      
      await comment.save();
      
      res.status(200).json({
        success: true,
        message: 'Signalements rejetés avec succès',
        data: comment
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

/**
 * @route   GET /api/admin/comments/export/csv
 * @desc    Exporter les données des commentaires en CSV
 * @access  Private (SuperAdmin)
 */
router.get('/export/csv', isSuperAdmin, async (req, res) => {
  try {
    const Comment = require('../../models/Comment');
    
    const comments = await Comment.find({})
      .populate('auteur', 'nom prenom email')
      .populate('video_id', 'titre artiste')
      .populate('post_id', 'contenu')
      .sort({ creation_date: -1 })
      .lean();
    
    // Préparer les données pour le CSV
    const csvData = comments.map(comment => ({
      id: comment._id,
      contenu: comment.contenu?.replace(/["\n\r]/g, ' ') || '',
      auteur: `${comment.auteur?.prenom || ''} ${comment.auteur?.nom || ''}`.trim(),
      email_auteur: comment.auteur?.email || '',
      type: comment.video_id ? 'Vidéo' : comment.post_id ? 'Post' : 'Autre',
      video_titre: comment.video_id?.titre || '',
      video_artiste: comment.video_id?.artiste || '',
      post_contenu: comment.post_id?.contenu?.substring(0, 50) || '',
      statut: comment.statut,
      likes: comment.likes || 0,
      dislikes: comment.dislikes || 0,
      nb_signalements: comment.signale_par?.length || 0,
      parent_comment: comment.parent_comment ? 'Oui' : 'Non',
      date_creation: comment.creation_date,
      date_modification: comment.modified_date
    }));
    
    // Générer l'en-tête CSV
    const headers = Object.keys(csvData[0]).join(',');
    const csvContent = [
      headers,
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="comments_export_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Erreur lors de l\'export CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export CSV'
    });
  }
});

// ========================================
// Routes de debug/test (à supprimer en production)
// ========================================

/**
 * @route   GET /api/admin/comments/test
 * @desc    Route de test pour vérifier que les middlewares fonctionnent
 * @access  Private (Admin)
 */
router.get('/test', isAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Routes admin commentaires fonctionnelles !',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

console.log('✅ [AdminCommentsRoutes] Routes admin commentaires configurées');

module.exports = router