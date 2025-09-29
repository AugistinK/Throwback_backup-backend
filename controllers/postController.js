// controllers/postController.js
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/* --------------------------------- Helpers -------------------------------- */

/** Construit une URL absolue à partir d’un chemin relatif (stocké en BDD) */
const buildAssetUrl = (req, maybePath) => {
  if (!maybePath || typeof maybePath !== 'string') return maybePath;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;

  const base =
    (process.env.BACKEND_URL && process.env.BACKEND_URL.replace(/\/+$/, '')) ||
    `${req.protocol}://${req.get('host')}`;
  const rel = maybePath.startsWith('/') ? maybePath : `/${maybePath}`;
  return `${base}${rel}`;
};

/** Convertit un chemin web relatif en chemin local absolu sûr pour fs.* */
const toLocalPath = (relativeWebPath) => {
  const clean = String(relativeWebPath || '').replace(/^\//, '');
  return path.join(__dirname, '..', clean);
};

const unlinkSafe = (absPath) => {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (e) {
    console.warn('unlinkSafe error:', e.message);
  }
};

/** “Habille” un post (objet JS) avec des URLs absolues pour les médias et avatars */
const decoratePost = (req, p) => {
  if (!p) return p;

  // Media du post
  if (p.media) p.media = buildAssetUrl(req, p.media);

  // Auteur (peut être objet ou id)
  if (p.auteur && typeof p.auteur === 'object') {
    if (p.auteur.photo_profil) {
      p.auteur.photo_profil = buildAssetUrl(req, p.auteur.photo_profil);
    }
  }

  // Commentaires (si peuplés)
  if (Array.isArray(p.commentaires)) {
    p.commentaires = p.commentaires.map((c) => {
      if (c && c.auteur && typeof c.auteur === 'object') {
        if (c.auteur.photo_profil) {
          c.auteur.photo_profil = buildAssetUrl(req, c.auteur.photo_profil);
        }
      }
      return c;
    });
  }

  return p;
};

/* -------------------------------- Controllers ----------------------------- */

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
    const sort = req.query.sort || 'recent';

    // Construction du filtre
    const filter = {};

    // Filtre de visibilité
    if (req.user) {
      // Publics ou mes propres posts (amis: à implémenter plus tard)
      filter.$or = [{ visibilite: 'PUBLIC' }, { auteur: req.user.id }];
    } else {
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
    let sortOption = { createdAt: -1 };
    if (sort === 'popular') {
      // NB: si likes/commentaires sont des tableaux, ce tri est approximatif.
      // Pour un vrai tri par popularité, ajouter des champs denormalisés (likeCount, commentCount).
      sortOption = { likes: -1, commentaires: -1, createdAt: -1 };
    }

    // Comptage total pour pagination
    const total = await Post.countDocuments(filter);

    // Récupération des posts
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

    // “Habillage” des URLs
    const decorated = posts.map((p) => decoratePost(req, p));

    // Calcul des pages totales
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: decorated,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des posts:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des posts'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    const post = await Post.findById(postId)
      .populate('auteur', 'nom prenom photo_profil')
      .populate({
        path: 'commentaires',
        populate: { path: 'auteur', select: 'nom prenom photo_profil' }
      })
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post non trouvé' });
    }

    // Accès
    if (post.visibilite !== 'PUBLIC' && (!req.user || String(post.auteur?._id) !== String(req.user.id))) {
      return res.status(403).json({ success: false, message: "Vous n'avez pas les droits pour accéder à ce post" });
    }

    res.status(200).json({ success: true, data: decoratePost(req, post) });
  } catch (error) {
    console.error('Erreur lors de la récupération du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération du post'
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

    if (!contenu || contenu.trim() === '') {
      return res.status(400).json({ success: false, message: 'Le contenu du post est requis' });
    }

    // Hashtags
    const hashtagsArray = Array.isArray(hashtags) ? hashtags : contenu.match(/#[\w\u00C0-\u017F]+/g) || [];

    const newPost = new Post({
      contenu,
      auteur: req.user.id,
      visibilite,
      hashtags: hashtagsArray,
      created_by: req.user.id
    });

    // Si un fichier est uploadé: on STOCKE un chemin RELATIF
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

    const post = await Post.findById(newPost._id).populate('auteur', 'nom prenom photo_profil').lean();

    res.status(201).json({
      success: true,
      message: 'Post créé avec succès',
      data: decoratePost(req, post)
    });
  } catch (error) {
    console.error('Erreur lors de la création du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la création du post'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    const post = await Post.findById(postId);

    if (!post) return res.status(404).json({ success: false, message: 'Post non trouvé' });

    if (post.auteur.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Vous n'êtes pas autorisé à modifier ce post" });
    }

    if (contenu !== undefined) post.contenu = contenu;
    if (visibilite !== undefined) post.visibilite = visibilite;
    if (hashtags !== undefined) {
      post.hashtags = Array.isArray(hashtags) ? hashtags : (contenu || '').match(/#[\w\u00C0-\u017F]+/g) || [];
    }

    // Si un nouveau média est uploadé: remplace l’ancien
    if (req.file) {
      if (post.media) unlinkSafe(toLocalPath(post.media)); // supprime l'ancien
      post.media = `/uploads/posts/${req.file.filename}`; // stocke RELATIF
      post.type_media = req.file.mimetype.startsWith('image/')
        ? 'IMAGE'
        : req.file.mimetype.startsWith('video/')
        ? 'VIDEO'
        : req.file.mimetype.startsWith('audio/')
        ? 'AUDIO'
        : 'NONE';
    }

    post.modified_by = req.user.id;
    post.updatedAt = Date.now();

    await post.save();

    const populated = await Post.findById(post._id).populate('auteur', 'nom prenom photo_profil').lean();

    res.status(200).json({
      success: true,
      message: 'Post mis à jour avec succès',
      data: decoratePost(req, populated)
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour du post'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    const post = await Post.findById(postId);

    if (!post) return res.status(404).json({ success: false, message: 'Post non trouvé' });

    if (post.auteur.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: "Vous n'êtes pas autorisé à supprimer ce post" });
    }

    // Supprimer le média associé si existant (chemin normalisé)
    if (post.media) unlinkSafe(toLocalPath(post.media));

    // Supprimer les commentaires associés
    await Comment.deleteMany({ post: postId });

    // Supprimer le post
    await Post.deleteOne({ _id: postId });

    res.status(200).json({ success: true, message: 'Post supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du post'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    const post = await Post.findById(postId);

    if (!post) return res.status(404).json({ success: false, message: 'Post non trouvé' });

    const index = post.likes.indexOf(req.user.id);
    let message;

    if (index === -1) {
      post.likes.push(req.user.id);
      message = 'Post liké avec succès';
    } else {
      post.likes.splice(index, 1);
      message = 'Like retiré avec succès';
    }

    await post.save();

    res.status(200).json({
      success: true,
      message,
      liked: index === -1,
      likeCount: post.likes.length
    });
  } catch (error) {
    console.error('Erreur lors du like/unlike du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du like/unlike du post'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    const post = await Post.findById(postId);

    if (!post) return res.status(404).json({ success: false, message: 'Post non trouvé' });

    post.partages += 1;
    await post.save();

    res.status(200).json({ success: true, message: 'Post partagé avec succès', shareCount: post.partages });
  } catch (error) {
    console.error('Erreur lors du partage du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du partage du post'
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

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide' });
    }

    if (!raison || raison.trim() === '') {
      return res.status(400).json({ success: false, message: 'La raison du signalement est requise' });
    }

    const post = await Post.findById(postId);

    if (!post) return res.status(404).json({ success: false, message: 'Post non trouvé' });

    const dejaSignale = post.signalements.some((s) => String(s.utilisateur) === req.user.id);

    if (dejaSignale) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà signalé ce post' });
    }

    post.signalements.push({ utilisateur: req.user.id, raison, date: Date.now() });

    if (post.signalements.length >= 3) {
      post.modere = true;
    }

    await post.save();

    res.status(200).json({ success: true, message: 'Post signalé avec succès' });
  } catch (error) {
    console.error('Erreur lors du signalement du post:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du signalement du post'
    });
  }
};
