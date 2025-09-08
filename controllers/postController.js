// controllers/postController.js
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Récupérer tous les posts (avec pagination et filtres)
 * @route   GET /api/posts
 * @access  Public/Private selon les paramètres de confidentialité
 */
exports.getPosts = async (req, res) => {
  try {
    // Extraction des paramètres de requête
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const hashtag = req.query.hashtag;
    const userId = req.query.userId;
    const sort = req.query.sort || 'recent'; // 'recent', 'popular'

    // Construction du filtre
    const filter = {};
    
    // Filtre de visibilité
    if (req.user) {
      // Si l'utilisateur est connecté, il peut voir:
      // 1. Les posts publics
      // 2. Ses propres posts
      // 3. Les posts de ses amis (à implémenter une fois que le système d'amitié sera prêt)
      filter.$or = [
        { visibilite: 'PUBLIC' },
        { auteur: req.user.id }
      ];
      
      // TODO: Ajouter les posts des amis quand le système d'amitié sera implémenté
      // if (req.user.amis && req.user.amis.length > 0) {
      //   filter.$or.push({ auteur: { $in: req.user.amis }, visibilite: 'FRIENDS' });
      // }
    } else {
      // Si non connecté, seulement les posts publics
      filter.visibilite = 'PUBLIC';
    }
    
    // Filtre par hashtag
    if (hashtag) {
      filter.hashtags = hashtag;
    }
    
    // Filtre par utilisateur
    if (userId) {
      filter.auteur = userId;
    }
    
    // Détermination du tri
    let sortOption = { createdAt: -1 }; // Par défaut, du plus récent au plus ancien
    if (sort === 'popular') {
      // Trier par popularité (nombre de likes + commentaires)
      sortOption = { likes: -1, commentaires: -1, createdAt: -1 };
    }
    
    // Comptage total pour pagination
    const total = await Post.countDocuments(filter);
    
    // Récupération des posts avec population des données auteur
    const posts = await Post.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('auteur', 'nom prenom photo_profil')
      .populate({
        path: 'commentaires',
        options: { limit: 3, sort: { createdAt: -1 } },
        populate: { path: 'auteur', select: 'nom prenom photo_profil' }
      })
      .lean();
    
    // Calcul des pages totales
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
    console.error("Erreur lors de la récupération des posts:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des posts"
    });
  }
};

/**
 * @desc    Récupérer un post spécifique
 * @route   GET /api/posts/:id
 * @access  Public/Private selon les paramètres de confidentialité
 */
exports.getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Récupérer le post avec ses commentaires
    const post = await Post.findById(postId)
      .populate('auteur', 'nom prenom photo_profil')
      .populate({
        path: 'commentaires',
        populate: { path: 'auteur', select: 'nom prenom photo_profil' }
      });
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Vérifier les droits d'accès
    if (post.visibilite !== 'PUBLIC' && (!req.user || post.auteur._id.toString() !== req.user.id)) {
      // TODO: Vérifier si l'utilisateur est ami avec l'auteur pour les posts FRIENDS
      return res.status(403).json({
        success: false,
        message: "Vous n'avez pas les droits pour accéder à ce post"
      });
    }
    
    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération du post"
    });
  }
};

/**
 * @desc    Créer un nouveau post
 * @route   POST /api/posts
 * @access  Private
 */
exports.createPost = async (req, res) => {
  try {
    const { contenu, visibilite = 'PUBLIC', hashtags = [] } = req.body;
    
    // Validation des données
    if (!contenu || contenu.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Le contenu du post est requis"
      });
    }
    
    // Traitement des hashtags
    const hashtagsArray = Array.isArray(hashtags) 
      ? hashtags 
      : contenu.match(/#[\w\u00C0-\u017F]+/g) || [];
    
    // Création du post
    const newPost = new Post({
      contenu,
      auteur: req.user.id,
      visibilite,
      hashtags: hashtagsArray,
      created_by: req.user.id
    });
    
    // Si un fichier est uploadé
    if (req.file) {
      newPost.media = `/uploads/posts/${req.file.filename}`;
      newPost.type_media = req.file.mimetype.startsWith('image/') 
        ? 'IMAGE' 
        : req.file.mimetype.startsWith('video/') 
        ? 'VIDEO' 
        : req.file.mimetype.startsWith('audio/') 
        ? 'AUDIO' 
        : 'NONE';
    }
    
    await newPost.save();
    
    // Récupérer le post créé avec les données de l'auteur
    const post = await Post.findById(newPost._id)
      .populate('auteur', 'nom prenom photo_profil');
    
    res.status(201).json({
      success: true,
      message: "Post créé avec succès",
      data: post
    });
  } catch (error) {
    console.error("Erreur lors de la création du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la création du post"
    });
  }
};

/**
 * @desc    Modifier un post
 * @route   PUT /api/posts/:id
 * @access  Private
 */
exports.updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { contenu, visibilite, hashtags } = req.body;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Récupérer le post
    const post = await Post.findById(postId);
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur est l'auteur du post
    if (post.auteur.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à modifier ce post"
      });
    }
    
    // Mise à jour des champs
    if (contenu) post.contenu = contenu;
    if (visibilite) post.visibilite = visibilite;
    if (hashtags) {
      post.hashtags = Array.isArray(hashtags) 
        ? hashtags 
        : contenu.match(/#[\w\u00C0-\u017F]+/g) || [];
    }
    
    post.modified_by = req.user.id;
    post.updatedAt = Date.now();
    
    await post.save();
    
    res.status(200).json({
      success: true,
      message: "Post mis à jour avec succès",
      data: post
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour du post"
    });
  }
};

/**
 * @desc    Supprimer un post
 * @route   DELETE /api/posts/:id
 * @access  Private
 */
exports.deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Récupérer le post
    const post = await Post.findById(postId);
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur est l'auteur du post ou un admin
    if (post.auteur.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à supprimer ce post"
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
    await Comment.deleteMany({ post: postId });
    
    // Supprimer le post
    await Post.deleteOne({ _id: postId });
    
    res.status(200).json({
      success: true,
      message: "Post supprimé avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression du post"
    });
  }
};

/**
 * @desc    Liker/Unliker un post
 * @route   POST /api/posts/:id/like
 * @access  Private
 */
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Récupérer le post
    const post = await Post.findById(postId);
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur a déjà liké le post
    const index = post.likes.indexOf(req.user.id);
    let message;
    
    if (index === -1) {
      // Ajouter le like
      post.likes.push(req.user.id);
      message = "Post liké avec succès";
    } else {
      // Retirer le like
      post.likes.splice(index, 1);
      message = "Like retiré avec succès";
    }
    
    await post.save();
    
    res.status(200).json({
      success: true,
      message,
      liked: index === -1, // true si le post a été liké, false si unliké
      likeCount: post.likes.length
    });
  } catch (error) {
    console.error("Erreur lors du like/unlike du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du like/unlike du post"
    });
  }
};

/**
 * @desc    Partager un post
 * @route   POST /api/posts/:id/share
 * @access  Private
 */
exports.sharePost = async (req, res) => {
  try {
    const postId = req.params.id;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Récupérer le post
    const post = await Post.findById(postId);
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Incrémenter le compteur de partages
    post.partages += 1;
    await post.save();
    
    res.status(200).json({
      success: true,
      message: "Post partagé avec succès",
      shareCount: post.partages
    });
  } catch (error) {
    console.error("Erreur lors du partage du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du partage du post"
    });
  }
};

/**
 * @desc    Signaler un post
 * @route   POST /api/posts/:id/report
 * @access  Private
 */
exports.reportPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { raison } = req.body;
    
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "ID de post invalide"
      });
    }
    
    // Validation des données
    if (!raison || raison.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "La raison du signalement est requise"
      });
    }
    
    // Récupérer le post
    const post = await Post.findById(postId);
    
    // Vérifier si le post existe
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur a déjà signalé le post
    const dejaSignale = post.signalements.some(s => s.utilisateur.toString() === req.user.id);
    
    if (dejaSignale) {
      return res.status(400).json({
        success: false,
        message: "Vous avez déjà signalé ce post"
      });
    }
    
    // Ajouter le signalement
    post.signalements.push({
      utilisateur: req.user.id,
      raison,
      date: Date.now()
    });
    
    // Si le nombre de signalements dépasse un seuil, marquer le post pour modération
    if (post.signalements.length >= 3) {
      post.modere = true;
    }
    
    await post.save();
    
    res.status(200).json({
      success: true,
      message: "Post signalé avec succès"
    });
  } catch (error) {
    console.error("Erreur lors du signalement du post:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du signalement du post"
    });
  }
};