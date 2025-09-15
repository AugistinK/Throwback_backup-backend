// controllers/adminPostController.js
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Récupérer les statistiques de modération des posts
 * @route   GET /api/admin/posts/stats
 * @access  Private (Admin)
 */
exports.getModerationStats = async (req, res) => {
  try {
    // Statistiques générales
    const totalPosts = await Post.countDocuments();
    const reportedPosts = await Post.countDocuments({ 
      'signalements.0': { $exists: true } 
    });
    const moderatedPosts = await Post.countDocuments({ modere: true });
    
    // Posts des dernières 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPosts = await Post.countDocuments({ 
      createdAt: { $gte: last24h } 
    });
    
    // Posts en attente (signalés mais pas encore modérés)
    const pendingPosts = await Post.countDocuments({ 
      'signalements.0': { $exists: true },
      modere: false 
    });
    
    // Posts par visibilité
    const visibilityStats = await Post.aggregate([
      {
        $group: {
          _id: '$visibilite',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Posts avec média
    const withMedia = await Post.countDocuments({ 
      type_media: { $ne: 'NONE' } 
    });
    
    res.status(200).json({
      success: true,
      data: {
        total: totalPosts,
        reported: reportedPosts,
        moderated: moderatedPosts,
        recent: recentPosts,
        pending: pendingPosts,
        withMedia,
        visibilityBreakdown: visibilityStats
      }
    });
  } catch (error) {
    console.error('Erreur lors du chargement des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement des statistiques de modération'
    });
  }
};

/**
 * @desc    Récupérer tous les posts avec filtres admin
 * @route   GET /api/admin/posts
 * @access  Private (Admin)
 */
exports.getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Construction du filtre
    const filter = {};
    
    // Filtres de recherche
    if (req.query.search) {
      filter.$or = [
        { contenu: { $regex: req.query.search, $options: 'i' } },
        { hashtags: { $in: [new RegExp(req.query.search, 'i')] } }
      ];
    }
    
    // Filtre par visibilité
    if (req.query.visibility) {
      filter.visibilite = req.query.visibility;
    }
    
    // Filtre par statut
    if (req.query.status === 'moderated') {
      filter.modere = true;
    } else if (req.query.status === 'active') {
      filter.modere = false;
    } else if (req.query.status === 'reported') {
      filter['signalements.0'] = { $exists: true };
    }
    
    // Filtre par présence de média
    if (req.query.hasMedia === 'true') {
      filter.type_media = { $ne: 'NONE' };
    } else if (req.query.hasMedia === 'false') {
      filter.type_media = 'NONE';
    }
    
    // Filtre par signalements
    if (req.query.hasReports === 'true') {
      filter['signalements.0'] = { $exists: true };
    } else if (req.query.hasReports === 'false') {
      filter.signalements = { $size: 0 };
    }
    
    // Détermination du tri
    let sortOption = { createdAt: -1 };
    switch (req.query.sortBy) {
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'most_liked':
        sortOption = { likes: -1, createdAt: -1 };
        break;
      case 'most_commented':
        sortOption = { commentaires: -1, createdAt: -1 };
        break;
      case 'most_reported':
        sortOption = { 'signalements': -1, createdAt: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }
    
    // Comptage total
    const total = await Post.countDocuments(filter);
    
    // Récupération des posts
    const posts = await Post.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('auteur', 'nom prenom photo_profil email')
      .populate({
        path: 'signalements.utilisateur',
        select: 'nom prenom'
      })
      .lean();
    
    // Ajouter les compteurs de commentaires
    for (let post of posts) {
      const commentCount = await Comment.countDocuments({ 
        post_id: post._id, 
        statut: 'ACTIF' 
      });
      post.commentaires = Array.isArray(post.commentaires) ? post.commentaires : [];
      post.commentCount = commentCount;
    }
    
    const totalPages = Math.ceil(total / limit);
    
    res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des posts admin:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des posts'
    });
  }
};

/**
 * @desc    Modérer un post
 * @route   PUT /api/admin/posts/:id/moderate
 * @access  Private (Admin)
 */
exports.moderatePost = async (req, res) => {
  try {
    const { raison_moderation } = req.body;
    const postId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de post invalide'
      });
    }
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }
    
    // Mettre à jour le statut de modération
    post.modere = true;
    post.raison_moderation = raison_moderation || 'Modéré par un administrateur';
    post.date_moderation = Date.now();
    post.modere_par = req.user.id;
    post.modified_by = req.user.id;
    
    await post.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'MODERATION_POST',
      description_action: `Post modéré : ${post._id}`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        post_id: post._id,
        raison: raison_moderation
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Post modéré avec succès',
      data: post
    });
  } catch (error) {
    console.error('Erreur lors de la modération du post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modération du post'
    });
  }
};

/**
 * @desc    Restaurer un post (retirer la modération)
 * @route   PUT /api/admin/posts/:id/restore
 * @access  Private (Admin)
 */
exports.restorePost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de post invalide'
      });
    }
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }
    
    // Retirer la modération
    post.modere = false;
    post.raison_moderation = '';
    post.date_moderation = null;
    post.modere_par = null;
    post.modified_by = req.user.id;
    
    await post.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'RESTAURATION_POST',
      description_action: `Post restauré : ${post._id}`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        post_id: post._id
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Post restauré avec succès',
      data: post
    });
  } catch (error) {
    console.error('Erreur lors de la restauration du post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la restauration du post'
    });
  }
};

/**
 * @desc    Actions en masse sur les posts
 * @route   POST /api/admin/posts/bulk-action
 * @access  Private (Admin)
 */
exports.bulkAction = async (req, res) => {
  try {
    const { action, postIds, raison_moderation } = req.body;
    
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste des IDs de posts requise'
      });
    }
    
    // Vérifier que tous les IDs sont valides
    const validIds = postIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== postIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Certains IDs de posts sont invalides'
      });
    }
    
    let updateResult;
    let logAction;
    
    switch (action) {
      case 'moderate':
        updateResult = await Post.updateMany(
          { _id: { $in: validIds } },
          {
            modere: true,
            raison_moderation: raison_moderation || 'Modération en masse',
            date_moderation: Date.now(),
            modere_par: req.user.id,
            modified_by: req.user.id
          }
        );
        logAction = 'MODERATION_MASSE_POSTS';
        break;
        
      case 'restore':
        updateResult = await Post.updateMany(
          { _id: { $in: validIds } },
          {
            modere: false,
            raison_moderation: '',
            date_moderation: null,
            modere_par: null,
            modified_by: req.user.id
          }
        );
        logAction = 'RESTAURATION_MASSE_POSTS';
        break;
        
      case 'delete':
        // Supprimer les médias associés
        const postsToDelete = await Post.find({ _id: { $in: validIds } });
        for (const post of postsToDelete) {
          if (post.media) {
            const mediaPath = path.join(__dirname, '..', post.media);
            if (fs.existsSync(mediaPath)) {
              fs.unlinkSync(mediaPath);
            }
          }
        }
        
        // Supprimer les commentaires associés
        await Comment.deleteMany({ post_id: { $in: validIds } });
        
        // Supprimer les posts
        updateResult = await Post.deleteMany({ _id: { $in: validIds } });
        logAction = 'SUPPRESSION_MASSE_POSTS';
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Action non reconnue'
        });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: logAction,
      description_action: `Action en masse "${action}" sur ${validIds.length} posts`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        action,
        post_ids: validIds,
        count: validIds.length
      }
    });
    
    res.status(200).json({
      success: true,
      message: `Action "${action}" appliquée avec succès`,
      affectedCount: updateResult.modifiedCount || updateResult.deletedCount
    });
  } catch (error) {
    console.error('Erreur lors de l\'action en masse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'action en masse'
    });
  }
};

/**
 * @desc    Récupérer un post avec détails complets (admin)
 * @route   GET /api/admin/posts/:id
 * @access  Private (Admin)
 */
exports.getPostDetails = async (req, res) => {
  try {
    const postId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de post invalide'
      });
    }
    
    const post = await Post.findById(postId)
      .populate('auteur', 'nom prenom photo_profil email telephone')
      .populate({
        path: 'signalements.utilisateur',
        select: 'nom prenom photo_profil email'
      })
      .populate({
        path: 'mentions',
        select: 'nom prenom photo_profil'
      })
      .lean();
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }
    
    // Ajouter les informations de modération si disponibles
    if (post.modere_par) {
      const moderateur = await User.findById(post.modere_par)
        .select('nom prenom')
        .lean();
      post.modere_par_nom = moderateur ? `${moderateur.prenom} ${moderateur.nom}` : 'Administrateur';
    }
    
    // Compter les commentaires
    const commentCount = await Comment.countDocuments({ 
      post_id: post._id, 
      statut: 'ACTIF' 
    });
    post.commentCount = commentCount;
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des détails du post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des détails du post'
    });
  }
};

/**
 * @desc    Supprimer définitivement un post (admin)
 * @route   DELETE /api/admin/posts/:id
 * @access  Private (Admin)
 */
exports.deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de post invalide'
      });
    }
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }
    
    // Supprimer le média associé si existant
    if (post.media) {
      const mediaPath = path.join(__dirname, '..', post.media);
      if (fs.existsSync(mediaPath)) {
        fs.unlinkSync(mediaPath);
      }
    }
    
    // Supprimer les commentaires associés
    await Comment.deleteMany({ post_id: postId });
    
    // Supprimer le post
    await Post.deleteOne({ _id: postId });
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'SUPPRESSION_POST_ADMIN',
      description_action: `Post supprimé par admin : ${postId}`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        post_id: postId,
        auteur_original: post.auteur
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Post supprimé définitivement avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du post'
    });
  }
};