// controllers/memoryController.js
const Comment = require('../models/Comment'); 
const Video = require('../models/Video');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * GET /api/videos/:id/memories
 * Commentaires de 1er niveau d’une vidéo (filtrage STRICT)
 */
exports.getVideoMemories = async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    const videoExists = await Video.exists({ _id: videoId });
    if (!videoExists) {
      return res.status(404).json({ success: false, message: "Vidéo non trouvée" });
    }

    let sortOrder = {};
    switch (sort) {
      case 'likes':   sortOrder = { likes: -1, creation_date: -1 }; break;
      case 'oldest':  sortOrder = { creation_date: 1 }; break;
      case 'recent':
      default:        sortOrder = { creation_date: -1 }; break;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const baseFilter = { video_id: videoId, statut: 'ACTIF', parent_comment: null };

    const [memories, total] = await Promise.all([
      Comment.find(baseFilter)
        .sort(sortOrder)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('auteur', 'nom prenom photo_profil'),
      Comment.countDocuments(baseFilter)
    ]);

    // Interactions utilisateur
    let withInteraction = memories;
    if (req.user) {
      const userId = req.user._id;
      withInteraction = memories.map(m => {
        const likedBy = Array.isArray(m.liked_by) ? m.liked_by : [];
        const dislikedBy = Array.isArray(m.disliked_by) ? m.disliked_by : [];
        return {
          ...m.toObject(),
          userInteraction: {
            liked: likedBy.some(id => id?.equals && id.equals(userId)),
            disliked: dislikedBy.some(id => id?.equals && id.equals(userId)),
            isAuthor: m.auteur?._id?.equals?.(userId) || false
          }
        };
      });
    }

    // Format homogène front
    const formatted = withInteraction.map(m => ({
      id: m._id,
      username: m.auteur ? `${m.auteur.prenom || ''} ${m.auteur.nom || ''}`.trim() : 'Utilisateur',
      type: 'posted',
      videoTitle: '',
      videoArtist: '',
      videoYear: '',
      imageUrl: m.auteur?.photo_profil || '/images/default-avatar.jpg',
      content: m.contenu || '',
      likes: m.likes || 0,
      comments: 0,
      userInteraction: m.userInteraction || { liked: false, disliked: false, isAuthor: false },
      createdAt: m.creation_date
    }));

    res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total, totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Erreur getVideoMemories:", err);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération des souvenirs" });
  }
};

/**
 * GET /api/memories  (liste générale, utilisé en fallback)
 */
exports.getAllMemories = async (req, res) => {
  try {
    const memories = await Comment.find({ statut: 'ACTIF', parent_comment: null })
      .populate('auteur', 'nom prenom photo_profil')
      .populate('video_id', 'titre artiste annee')
      .sort({ creation_date: -1 })
      .limit(200);

    res.status(200).json({ success: true, data: memories });
  } catch (error) {
    console.error('Erreur getAllMemories:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des souvenirs' });
  }
};

/**
 * POST /api/videos/:id/memories
 */
exports.addMemory = async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { contenu } = req.body;
    const userId = req.user._id || req.user.id;

    if (!contenu || !contenu.trim()) {
      return res.status(400).json({ success: false, message: "Le contenu du souvenir est requis" });
    }
    if (contenu.length > 500) {
      return res.status(400).json({ success: false, message: "Le contenu ne doit pas dépasser 500 caractères" });
    }
    if (!userId) return res.status(401).json({ success: false, message: "Utilisateur non authentifié" });

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ success: false, message: "Vidéo non trouvée" });

    const memory = await Comment.create({
      contenu: contenu.trim(),
      video_id: videoId,
      auteur: userId,
      statut: 'ACTIF',
      creation_date: Date.now(),
      created_by: userId,
      likes: 0, dislikes: 0, liked_by: [], disliked_by: [], signale_par: []
    });

    // Mettre à jour compteur
    video.meta = video.meta || {};
    video.meta.commentCount = (video.meta.commentCount || 0) + 1;
    await video.save();

    const populated = await Comment.findById(memory._id).populate('auteur', 'nom prenom photo_profil');

    res.status(201).json({
      success: true,
      message: "Souvenir ajouté avec succès",
      data: {
        id: populated._id,
        username: populated.auteur ? `${populated.auteur.prenom || ''} ${populated.auteur.nom || ''}`.trim() : 'Utilisateur',
        content: populated.contenu,
        likes: populated.likes || 0,
        dislikes: populated.dislikes || 0,
        createdAt: populated.creation_date,
        userInteraction: { liked: false, disliked: false, isAuthor: true }
      }
    });
  } catch (err) {
    console.error("Erreur addMemory:", err);
    res.status(500).json({ success: false, message: "Erreur lors de l'ajout du souvenir" });
  }
};

/**
 * DELETE /api/memories/:id  (supprime un souvenir OU une réponse)
 * - soft delete + soft delete des réponses si parent
 */
exports.deleteMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;

    const memory = await Comment.findById(memoryId);
    if (!memory) return res.status(404).json({ success: false, message: "Souvenir non trouvé" });

    const isAuthor = memory.auteur?.equals?.(userId);
    const isAdmin = req.user.role === 'admin' || 
                    (Array.isArray(req.user.roles) && req.user.roles.some(r => r === 'admin' || r?.libelle_role === 'admin'));
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, message: "Action non autorisée" });
    }

    if (!memory.parent_comment) {
      await Comment.updateMany(
        { parent_comment: memoryId },
        { statut: 'SUPPRIME', modified_date: Date.now(), modified_by: userId }
      );
    }

    memory.statut = 'SUPPRIME';
    memory.modified_date = Date.now();
    memory.modified_by = userId;
    await memory.save();

    // Décrémenter le compteur de la vidéo
    const video = await Video.findById(memory.video_id);
    if (video?.meta && typeof video.meta.commentCount === 'number') {
      video.meta.commentCount = Math.max(0, video.meta.commentCount - 1);
      await video.save();
    }

    try {
      await LogAction.create({
        type_action: "MEMOIRE_SUPPRIMEE",
        description_action: "Souvenir supprimé",
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: { video_id: memory.video_id, memoire_id: memoryId, est_reponse: !!memory.parent_comment }
      });
    } catch {}

    res.status(200).json({ success: true, message: "Souvenir supprimé avec succès" });
  } catch (err) {
    console.error("Erreur deleteMemory:", err);
    res.status(500).json({ success: false, message: "Erreur lors de la suppression du souvenir" });
  }
};

/**
 * POST /api/memories/:id/like
 */
exports.likeMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;

    const memory = await Comment.findById(memoryId);
    if (!memory) return res.status(404).json({ success: false, message: "Souvenir non trouvé" });

    memory.liked_by = Array.isArray(memory.liked_by) ? memory.liked_by : [];
    memory.disliked_by = Array.isArray(memory.disliked_by) ? memory.disliked_by : [];
    if (typeof memory.likes !== 'number') memory.likes = 0;
    if (typeof memory.dislikes !== 'number') memory.dislikes = 0;

    const hasLiked = memory.liked_by.some(id => id?.equals?.(userId));
    const hasDisliked = memory.disliked_by.some(id => id?.equals?.(userId));

    if (hasLiked) {
      memory.liked_by = memory.liked_by.filter(id => !id.equals(userId));
      memory.likes = Math.max(0, memory.likes - 1);
    } else {
      memory.liked_by.push(userId);
      memory.likes += 1;
      if (hasDisliked) {
        memory.disliked_by = memory.disliked_by.filter(id => !id.equals(userId));
        memory.dislikes = Math.max(0, memory.dislikes - 1);
      }
    }
    await memory.save();

    res.status(200).json({
      success: true,
      message: hasLiked ? "Like retiré" : "Like ajouté",
      data: { liked: !hasLiked, disliked: false, likes: memory.likes, dislikes: memory.dislikes }
    });
  } catch (err) {
    console.error("Erreur likeMemory:", err);
    res.status(500).json({ success: false, message: "Erreur lors du like" });
  }
};

/**
 * POST /api/memories/:id/dislike
 */
exports.dislikeMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;

    const memory = await Comment.findById(memoryId);
    if (!memory) return res.status(404).json({ success: false, message: "Souvenir non trouvé" });

    memory.liked_by = Array.isArray(memory.liked_by) ? memory.liked_by : [];
    memory.disliked_by = Array.isArray(memory.disliked_by) ? memory.disliked_by : [];
    if (typeof memory.likes !== 'number') memory.likes = 0;
    if (typeof memory.dislikes !== 'number') memory.dislikes = 0;

    const hasLiked = memory.liked_by.some(id => id?.equals?.(userId));
    const hasDisliked = memory.disliked_by.some(id => id?.equals?.(userId));

    if (hasDisliked) {
      memory.disliked_by = memory.disliked_by.filter(id => !id.equals(userId));
      memory.dislikes = Math.max(0, memory.dislikes - 1);
    } else {
      memory.disliked_by.push(userId);
      memory.dislikes += 1;
      if (hasLiked) {
        memory.liked_by = memory.liked_by.filter(id => !id.equals(userId));
        memory.likes = Math.max(0, memory.likes - 1);
      }
    }
    await memory.save();

    res.status(200).json({
      success: true,
      message: hasDisliked ? "Dislike retiré" : "Dislike ajouté",
      data: { liked: false, disliked: !hasDisliked, likes: memory.likes, dislikes: memory.dislikes }
    });
  } catch (err) {
    console.error("Erreur dislikeMemory:", err);
    res.status(500).json({ success: false, message: "Erreur lors du dislike" });
  }
};

/**
 * GET /api/memories/:id/replies
 */
exports.getMemoryReplies = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const { page = 1, limit = 5 } = req.query;

    const parentExists = await Comment.exists({ _id: memoryId });
    if (!parentExists) return res.status(404).json({ success: false, message: "Souvenir parent non trouvé" });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [replies, total] = await Promise.all([
      Comment.find({ parent_comment: memoryId, statut: 'ACTIF' })
        .sort({ creation_date: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('auteur', 'nom prenom photo_profil'),
      Comment.countDocuments({ parent_comment: memoryId, statut: 'ACTIF' })
    ]);

    let withInteraction = replies;
    if (req.user) {
      const userId = req.user._id;
      withInteraction = replies.map(r => {
        const likedBy = Array.isArray(r.liked_by) ? r.liked_by : [];
        const dislikedBy = Array.isArray(r.disliked_by) ? r.disliked_by : [];
        return {
          ...r.toObject(),
          userInteraction: {
            liked: likedBy.some(id => id?.equals?.(userId)),
            disliked: dislikedBy.some(id => id?.equals?.(userId)),
            isAuthor: r.auteur?._id?.equals?.(userId) || false
          }
        };
      });
    }

    res.status(200).json({
      success: true,
      data: withInteraction,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error("Erreur getMemoryReplies:", err);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération des réponses" });
  }
};

/**
 * POST /api/memories/:id/replies
 */
exports.addReply = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const { contenu } = req.body;
    const userId = req.user._id || req.user.id;

    if (!contenu || !contenu.trim()) {
      return res.status(400).json({ success: false, message: "Le contenu de la réponse est requis" });
    }
    if (contenu.length > 500) {
      return res.status(400).json({ success: false, message: "Le contenu ne doit pas dépasser 500 caractères" });
    }

    const parent = await Comment.findById(memoryId);
    if (!parent) return res.status(404).json({ success: false, message: "Souvenir parent non trouvé" });

    const reply = await Comment.create({
      contenu: contenu.trim(),
      video_id: parent.video_id,
      auteur: userId,
      parent_comment: memoryId,
      statut: 'ACTIF',
      creation_date: Date.now(),
      created_by: userId,
      likes: 0, dislikes: 0, liked_by: [], disliked_by: [], signale_par: []
    });

    const populated = await Comment.findById(reply._id).populate('auteur', 'nom prenom photo_profil');

    res.status(201).json({
      success: true,
      message: "Réponse ajoutée avec succès",
      data: {
        id: populated._id,
        content: populated.contenu,
        auteur: populated.auteur,
        likes: populated.likes || 0,
        creation_date: populated.creation_date,
        userInteraction: { liked: false, disliked: false, isAuthor: true }
      }
    });
  } catch (err) {
    console.error("Erreur addReply:", err);
    res.status(500).json({ success: false, message: "Erreur lors de l'ajout de la réponse" });
  }
};

/**
 * GET /api/public/memories/recent
 */
exports.getRecentMemories = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const memories = await Comment.find({ statut: 'ACTIF', parent_comment: null })
      .sort({ creation_date: -1 })
      .limit(parseInt(limit))
      .populate('auteur', 'nom prenom photo_profil')
      .populate('video_id', 'titre artiste annee');

    const formatted = await Promise.all(memories.map(async (m) => {
      const replyCount = await Comment.countDocuments({ parent_comment: m._id, statut: 'ACTIF' });
      return {
        _id: m._id,
        auteur: m.auteur || { nom: '', prenom: '' },
        video: m.video_id || { titre: '', artiste: '', annee: '' },
        contenu: m.contenu || '',
        likes: m.likes || 0,
        nb_commentaires: replyCount,
        creation_date: m.creation_date
      };
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    console.error("Erreur getRecentMemories:", err);
    res.status(500).json({ success: false, message: "Erreur lors de la récupération des souvenirs récents" });
  }
};
