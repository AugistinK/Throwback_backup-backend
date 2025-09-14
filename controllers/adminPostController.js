// controllers/adminPostController.js
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const LogAction = require('../models/LogAction');


// Modérer un post
exports.moderatePost = async (req, res) => {
  try {
    const { raison_moderation } = req.body;
    
    if (!raison_moderation) {
      return res.status(400).json({
        success: false,
        message: "La raison de modération est requise"
      });
    }
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Mettre à jour le post
    post.modere = true;
    post.raison_moderation = raison_moderation;
    post.date_moderation = Date.now();
    post.modere_par = req.user.id;
    
    await post.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "MODERATION_POST",
      description_action: `Modération du post ${post._id}`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        raison: raison_moderation,
        post_id: post._id
      }
    });
    
    res.json({
      success: true,
      message: "Post modéré avec succès",
      data: post
    });
  } catch (error) {
    console.error('Erreur lors de la modération du post:', error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la modération du post"
    });
  }
};

// Restaurer un post modéré
exports.restorePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Mettre à jour le post
    post.modere = false;
    post.raison_moderation = null;
    
    await post.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "RESTAURATION_POST",
      description_action: `Restauration du post ${post._id}`,
      id_user: req.user.id,
      created_by: req.user.id
    });
    
    res.json({
      success: true,
      message: "Post restauré avec succès",
      data: post
    });
  } catch (error) {
    console.error('Erreur lors de la restauration du post:', error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la restauration du post"
    });
  }
};


// Obtenir les statistiques de modération
exports.getModerationStats = async (req, res) => {
  try {
    // Compter le nombre total de posts
    const total = await Post.countDocuments();
    
    // Compter les posts signalés
    const reported = await Post.countDocuments({ 'signalements.0': { $exists: true } });
    
    // Compter les posts modérés
    const moderated = await Post.countDocuments({ modere: true });
    
    // Compter les posts récents (dernières 24h)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const recent = await Post.countDocuments({ createdAt: { $gte: oneDayAgo } });
    
    // Compter les posts en attente (signalés mais pas modérés)
    const pending = await Post.countDocuments({ 
      'signalements.0': { $exists: true },
      modere: false
    });
    
    res.json({
      success: true,
      data: {
        total,
        reported,
        moderated,
        recent,
        pending
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des statistiques"
    });
  }
};