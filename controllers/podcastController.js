const Podcast = require('../models/Podcast');
const mongoose = require('mongoose');
const LogAction = require('../models/LogAction');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Récupérer tous les podcasts (publics)
 * @route   GET /api/podcasts
 * @access  Public
 */
exports.getAllPodcasts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      season,
      category,
      sort = '-publishDate'
    } = req.query;

    // Construire le filtre
    const filter = { isPublished: true };
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { guestName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (season) {
      filter.season = parseInt(season);
    }
    
    if (category) {
      filter.category = category;
    }

    // Compter le nombre total
    const total = await Podcast.countDocuments(filter);
    
    // Récupérer les podcasts paginés
    const podcasts = await Podcast.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: podcasts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching podcasts:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts',
      error: error.message
    });
  }
};

// Dans podcastController.js, méthode getPodcastById

exports.getPodcastById = async (req, res) => {
  try {
    const podcast = await Podcast.findById(req.params.id)
      .populate('author', 'nom prenom');
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }

    // Incrémenter le compteur de vues
    podcast.viewCount += 1;
    await podcast.save();

    // Préparer les données complètes pour le frontend
    const podcastData = {
      ...podcast.toObject(),
      
      // S'assurer que les URLs d'image sont complètes
      coverImageUrl: podcast.coverImage ? 
        (podcast.coverImage.startsWith('http') ? podcast.coverImage : 
        `${process.env.BACKEND_URL || 'https://api.throwback-connect.com'}${podcast.coverImage.startsWith('/') ? '' : '/'}${podcast.coverImage}`) 
        : null,
        
      // S'assurer que l'URL de la plateforme est utilisable pour l'embed
      embedUrl: podcast.getEmbedUrl ? podcast.getEmbedUrl() : null
    };

    res.status(200).json({
      success: true,
      data: podcastData
    });
  } catch (error) {
    console.error('Error fetching podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération du podcast',
      error: error.message
    });
  }
};

/**
 * @desc    Créer un nouveau podcast
 * @route   POST /api/admin/podcasts
 * @access  Private/Admin
 */
exports.createPodcast = async (req, res) => {
  try {
    const {
      title,
      episode,
      season,
      videoUrl,
      duration,
      description,
      guestName,
      hostName,
      publishDate,
      topics,
      category,
      isPublished,
      isHighlighted,
      platform,
      videoId,
      thumbnailUrl
    } = req.body;

    // Valider les champs obligatoires
    if (!title || !episode || !videoUrl || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Les champs titre, numéro d\'épisode, URL vidéo et durée sont obligatoires'
      });
    }

    // Si un fichier a été uploadé, utiliser son chemin
    let coverImage = req.body.coverImage;
    if (req.file) {
      coverImage = `/uploads/podcasts/${req.file.filename}`;
    }

    // Créer le nouveau podcast
    const podcast = new Podcast({
      title,
      episode,
      season: season || 1,
      videoUrl,
      duration,
      coverImage,
      description,
      guestName,
      hostName,
      publishDate: publishDate || Date.now(),
      topics: Array.isArray(topics) ? topics : (topics ? topics.split(',').map(t => t.trim()) : []),
      category,
      isPublished: isPublished !== undefined ? isPublished : true,
      isHighlighted: isHighlighted || false,
      author: req.user.id,
      platform,
      videoId,
      thumbnailUrl
    });

    await podcast.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'CREATION_PODCAST',
      description_action: `Création du podcast "${title}" (épisode ${episode})`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Podcast créé avec succès',
      data: podcast
    });
  } catch (error) {
    console.error('Error creating podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la création du podcast',
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour un podcast
 * @route   PUT /api/admin/podcasts/:id
 * @access  Private/Admin
 */
exports.updatePodcast = async (req, res) => {
  try {
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(req.params.id);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }

    // Si un fichier a été uploadé, utiliser son chemin
    if (req.file) {
      // Supprimer l'ancienne image si elle existe et n'est pas l'image par défaut
      if (podcast.coverImage && !podcast.coverImage.includes('podcast-default.jpg') && fs.existsSync(path.join(__dirname, '..', podcast.coverImage))) {
        fs.unlinkSync(path.join(__dirname, '..', podcast.coverImage));
      }
      req.body.coverImage = `/uploads/podcasts/${req.file.filename}`;
    }

    // Si videoUrl a changé, mettre à jour platform et videoId
    if (req.body.videoUrl && req.body.videoUrl !== podcast.videoUrl) {
      // La logique de détection de plateforme sera gérée par le middleware et les hooks du modèle
    }

    // Mettre à jour les champs
    const updatableFields = [
      'title', 'episode', 'season', 'videoUrl', 'duration', 'coverImage',
      'description', 'guestName', 'hostName', 'publishDate', 'topics',
      'category', 'isPublished', 'isHighlighted', 'platform', 'videoId',
      'thumbnailUrl'
    ];

    // Si topics est une chaîne, la convertir en tableau
    if (req.body.topics && typeof req.body.topics === 'string') {
      req.body.topics = req.body.topics.split(',').map(t => t.trim());
    }

    // Mettre à jour chaque champ
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        podcast[field] = req.body[field];
      }
    });

    await podcast.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'MODIFICATION_PODCAST',
      description_action: `Modification du podcast "${podcast.title}" (épisode ${podcast.episode})`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Podcast mis à jour avec succès',
      data: podcast
    });
  } catch (error) {
    console.error('Error updating podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour du podcast',
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer un podcast
 * @route   DELETE /api/admin/podcasts/:id
 * @access  Private/Admin
 */
exports.deletePodcast = async (req, res) => {
  try {
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(req.params.id);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }

    // Supprimer l'image de couverture si elle n'est pas l'image par défaut
    if (podcast.coverImage && !podcast.coverImage.includes('podcast-default.jpg')) {
      const imagePath = path.join(__dirname, '..', podcast.coverImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Supprimer le podcast
    await podcast.deleteOne();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'SUPPRESSION_PODCAST',
      description_action: `Suppression du podcast "${podcast.title}" (épisode ${podcast.episode})`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Podcast supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du podcast',
      error: error.message
    });
  }
};


/**
 * @desc    Récupérer les statistiques des podcasts
 * @route   GET /api/admin/podcasts/stats
 * @access  Private/Admin
 */
exports.getPodcastStats = async (req, res) => {
  try {
    // Nombre total de podcasts
    const total = await Podcast.countDocuments();
    
    // Nombre de podcasts par saison
    const seasonStats = await Podcast.aggregate([
      { $group: { _id: '$season', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Nombre de podcasts par catégorie
    const categoryStats = await Podcast.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Podcasts les plus vus
    const mostViewed = await Podcast.find()
      .sort('-viewCount')
      .limit(5)
      .select('title episode season viewCount');
    
    // Podcasts les plus aimés
    const mostLiked = await Podcast.find()
      .sort('-likeCount')
      .limit(5)
      .select('title episode season likeCount');

    res.status(200).json({
      success: true,
      data: {
        total,
        byCategory: categoryStats,
        bySeason: seasonStats,
        mostViewed,
        mostLiked
      }
    });
  } catch (error) {
    console.error('Error fetching podcast stats:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer tous les podcasts (admin)
 * @route   GET /api/admin/podcasts
 * @access  Private/Admin
 */
exports.getAllPodcastsAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      season,
      category,
      sort = '-publishDate',
      publishStatus
    } = req.query;

    // Construire le filtre
    const filter = {};
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { guestName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (season) {
      filter.season = parseInt(season);
    }
    
    if (category) {
      filter.category = category;
    }

    if (publishStatus) {
      filter.isPublished = publishStatus === 'published';
    }

    // Compter le nombre total
    const total = await Podcast.countDocuments(filter);
    
    // Récupérer les podcasts paginés
    const podcasts = await Podcast.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: podcasts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching podcasts for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts',
      error: error.message
    });
  }
};