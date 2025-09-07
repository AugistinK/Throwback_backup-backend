// controllers/liveStreamController.js
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');
const LiveChatMessage = require('../models/liveChatMessage');
const mongoose = require('mongoose');

// Niveau de log configurable
const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'error';

// Fonction de log personnalisée
const logger = {
  debug: (...args) => LOG_LEVEL === 'debug' && console.log(...args),
  info: (...args) => ['debug', 'info'].includes(LOG_LEVEL) && console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args)
};

/**
 * Fonction pour démarrer automatiquement les streams programmés
 */
const autoStartScheduledStreams = async () => {
  const now = new Date();
  
  try {
    const streamsToStart = await LiveStream.find({
      status: 'SCHEDULED',
      scheduledStartTime: { $lte: now },
      scheduledEndTime: { $gt: now }
    });

    for (const stream of streamsToStart) {
      stream.status = 'LIVE';
      stream.actualStartTime = now;
      await stream.save();
      
      logger.info(`Auto-started stream: ${stream.title}`);
    }

    return streamsToStart.length;
  } catch (error) {
    logger.error('Error auto-starting scheduled streams:', error);
    return 0;
  }
};

/**
 * Fonction pour terminer automatiquement les streams expirés
 */
const autoEndExpiredStreams = async () => {
  const now = new Date();
  
  try {
    const streamsToEnd = await LiveStream.find({
      status: 'LIVE',
      scheduledEndTime: { $lte: now }
    });

    for (const stream of streamsToEnd) {
      stream.status = 'COMPLETED';
      stream.actualEndTime = now;
      
      // Si l'enregistrement est activé, générer un ID de vidéo enregistrée
      if (stream.recordAfterStream) {
        stream.recordedVideoId = `rec_${Date.now()}_${stream._id}`;
      }
      
      await stream.save();
      
      logger.info(`Auto-ended stream: ${stream.title}`);
    }

    return streamsToEnd.length;
  } catch (error) {
    logger.error('Error auto-ending expired streams:', error);
    return 0;
  }
};

/**
 * Middleware pour mettre à jour automatiquement les streams
 */
const autoUpdateStreams = async (req, res, next) => {
  try {
    await autoStartScheduledStreams();
    await autoEndExpiredStreams();
    next();
  } catch (error) {
    logger.error('Error in auto-update middleware:', error);
    next(); 
  }
};

/**
 * @desc    Récupérer tous les livestreams publics
 * @route   GET /api/livestreams
 * @access  Public
 */
exports.getAllPublicLiveStreams = async (req, res) => {
  try {
    // Mise à jour automatique des statuts
    await autoStartScheduledStreams();
    await autoEndExpiredStreams();
    
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status,
      category,
      sort = '-scheduledStartTime',
      compilationType,
      activeOnly = false 
    } = req.query;

    // Construire le filtre
    const filter = { isPublic: true };
    
    // Si activeOnly est true, montrer seulement les streams LIVE non expirés
    if (activeOnly === 'true') {
      const now = new Date();
      filter.status = 'LIVE';
      filter.scheduledEndTime = { $gt: now };
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { hostName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (compilationType) {
      filter.compilationType = compilationType;
    }

    // Compter le nombre total
    const total = await LiveStream.countDocuments(filter);
    
    // Récupérer les livestreams paginés
    const livestreams = await LiveStream.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: livestreams,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching livestreams:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des livestreams',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer un livestream par ID
 * @route   GET /api/livestreams/:id
 * @access  Public
 */
exports.getLiveStreamById = async (req, res) => {
  try {
    // Mise à jour automatique avant récupération
    await autoStartScheduledStreams();
    await autoEndExpiredStreams();
    
    const livestream = await LiveStream.findById(req.params.id)
      .populate('author', 'nom prenom');
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier si le livestream est public ou si l'utilisateur est l'auteur
    if (!livestream.isPublic && (!req.user || req.user.id !== livestream.author._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à accéder à ce livestream'
      });
    }

    res.status(200).json({
      success: true,
      data: livestream
    });
  } catch (error) {
    console.error('Error fetching livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Créer un nouveau livestream
 * @route   POST /api/livestreams
 * @access  Private
 */
exports.createLiveStream = async (req, res) => {
  try {
    const {
      title,
      description,
      scheduledStartTime,
      scheduledEndTime,
      playbackUrl,
      thumbnailUrl,
      category,
      isPublic,
      isRecurring,
      recurringPattern,
      tags,
      hostName,
      guests,
      chatEnabled,
      moderationEnabled,
      visibilitySettings,
      streamProvider,
      streamConfig,
      recordAfterStream,
      // Nouveaux champs pour les compilations
      compilationType,
      compilationVideos,
      playbackConfig,
      startNow
    } = req.body;

    // Vérification et validation des dates
    const now = new Date();
    const start = new Date(scheduledStartTime);
    const end = new Date(scheduledEndTime);
    
    if (isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Date de début invalide"
      });
    }
    
    if (isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Date de fin invalide"
      });
    }
    
    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "La date de fin doit être postérieure à la date de début"
      });
    }

    // Vérifier que la date de fin est dans le futur
    if (end <= now) {
      return res.status(400).json({
        success: false,
        message: "La date de fin doit être dans le futur"
      });
    }

    // Générer une clé de stream unique
    const streamKey = LiveStream.generateStreamKey();
    
    // Construire l'URL de stream en fonction du provider
    let streamUrl;
    switch (streamProvider) {
      case 'VIMEO':
        streamUrl = `rtmp://live.vimeo.com/app/${streamKey}`;
        break;
      case 'YOUTUBE':
        streamUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
        break;
      case 'CUSTOM':
        streamUrl = req.body.streamUrl || `rtmp://stream.throwback.com/live/${streamKey}`;
        break;
      default:
        streamUrl = `rtmp://stream.throwback.com/live/${streamKey}`;
    }

    // Normaliser les sourceType des vidéos de compilation en majuscules
    const normalizedCompilationVideos = compilationVideos ? compilationVideos.map(video => ({
      ...video,
      sourceType: video.sourceType ? video.sourceType.toUpperCase() : video.sourceType
    })) : [];

    // Démarrage immédiat pour les admins si demandé et si l'heure de début est maintenant ou passée
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    const shouldStartNow = (isAdmin && startNow === true) || start <= now;
    const initialStatus = shouldStartNow ? 'LIVE' : 'SCHEDULED';

    // Créer le nouveau livestream
    const livestream = new LiveStream({
      title,
      description,
      scheduledStartTime: start,
      scheduledEndTime: end,
      status: initialStatus,
      streamKey,
      streamUrl,
      playbackUrl,
      thumbnailUrl,
      category,
      isPublic: isPublic !== undefined ? isPublic : true,
      isRecurring: isRecurring || false,
      recurringPattern,
      tags: tags || [],
      hostName: hostName || 'ThrowBack Host',
      guests: guests || [],
      chatEnabled: chatEnabled !== undefined ? chatEnabled : true,
      moderationEnabled: moderationEnabled !== undefined ? moderationEnabled : true,
      visibilitySettings,
      author: req.user.id,
      streamProvider: streamProvider || 'VIMEO',
      streamConfig,
      recordAfterStream: recordAfterStream !== undefined ? recordAfterStream : true,
      // Attributs pour les compilations avec sourceType normalisé
      compilationType: compilationType || 'DIRECT',
      compilationVideos: normalizedCompilationVideos,
      playbackConfig: playbackConfig || {
        loop: true,
        autoplay: true,
        shuffle: false,
        transitionEffect: 'none'
      },
      // Initialiser la liste des utilisateurs bannis
      bannedUsers: [],
      actualStartTime: initialStatus === 'LIVE' ? now : null,
      currentVideoIndex: 0
    });

    await livestream.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'CREATION_LIVESTREAM',
      description_action: `Création du livestream "${title}"${compilationType === 'VIDEO_COLLECTION' ? ' (compilation)' : ''}`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Livestream créé avec succès',
      data: livestream
    });
  } catch (error) {
    console.error('Error creating livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la création du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour un livestream
 * @route   PUT /api/livestreams/:id
 * @access  Private
 */
exports.updateLiveStream = async (req, res) => {
  try {
    const livestream = await LiveStream.findById(req.params.id);
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'auteur ou un admin
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modifier ce livestream'
      });
    }

    // Vérifier si le livestream est déjà terminé ou annulé
    // Pour les admins, permettre la modification même si terminé ou annulé
    if ((livestream.status === 'COMPLETED' || livestream.status === 'CANCELLED') && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de modifier un livestream terminé ou annulé'
      });
    }

    // Liste des champs modifiables
    const updatableFields = [
      'title', 'description', 'scheduledStartTime', 'scheduledEndTime',
      'status', 'playbackUrl', 'thumbnailUrl', 'category', 'isPublic',
      'isRecurring', 'recurringPattern', 'tags', 'hostName', 'guests',
      'chatEnabled', 'moderationEnabled', 'visibilitySettings',
      'streamProvider', 'streamConfig', 'recordAfterStream', 'playbackConfig'
    ];

    // Mettre à jour les champs
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        livestream[field] = req.body[field];
      }
    });

    // Validation des dates mises à jour
    if (req.body.scheduledStartTime && req.body.scheduledEndTime) {
      const start = new Date(req.body.scheduledStartTime);
      const end = new Date(req.body.scheduledEndTime);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Dates invalides"
        });
      }
      
      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: "La date de fin doit être postérieure à la date de début"
        });
      }
    }

    // Traitement spécial pour compilationVideos pour normaliser sourceType
    if (req.body.compilationVideos) {
      livestream.compilationVideos = req.body.compilationVideos.map(video => ({
        ...video,
        sourceType: video.sourceType ? video.sourceType.toUpperCase() : video.sourceType
      }));
    }

    // Si le statut change vers LIVE, définir la date de début réelle
    if (req.body.status === 'LIVE' && livestream.status !== 'LIVE') {
      livestream.actualStartTime = new Date();
    }

    // Si le statut change vers COMPLETED, définir la date de fin réelle
    if (req.body.status === 'COMPLETED' && livestream.status !== 'COMPLETED') {
      livestream.actualEndTime = new Date();
    }

    await livestream.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'MODIFICATION_LIVESTREAM',
      description_action: `Modification du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Livestream mis à jour avec succès',
      data: livestream
    });
  } catch (error) {
    console.error('Error updating livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer un livestream
 * @route   DELETE /api/livestreams/:id
 * @access  Private
 */
exports.deleteLiveStream = async (req, res) => {
  try {
    const livestream = await LiveStream.findById(req.params.id);
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'auteur ou un admin
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à supprimer ce livestream'
      });
    }

    // Vérifier si le livestream est en cours
    // Pour les admins, permettre la suppression même si en direct
    if (livestream.status === 'LIVE' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer un livestream en cours. Veuillez d\'abord terminer le stream.'
      });
    }

    await livestream.deleteOne();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'SUPPRESSION_LIVESTREAM',
      description_action: `Suppression du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Livestream supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Démarrer un livestream
 * @route   PUT /api/livestreams/:id/start
 * @access  Private
 */
exports.startLiveStream = async (req, res) => {
  try {
    const livestream = await LiveStream.findById(req.params.id);
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'auteur ou un admin
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à démarrer ce livestream'
      });
    }

    // Vérifier si le livestream peut être démarré
    // Pour les admins, permettre le redémarrage même si pas SCHEDULED
    if (livestream.status !== 'SCHEDULED' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: `Impossible de démarrer un livestream avec le statut ${livestream.status}`
      });
    }

    const now = new Date();
    
    // Vérifier que le livestream n'est pas expiré
    if (livestream.scheduledEndTime && livestream.scheduledEndTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de démarrer un livestream expiré'
      });
    }

    // Mettre à jour le statut et l'heure de début
    livestream.status = 'LIVE';
    livestream.actualStartTime = now;
    await livestream.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'DEMARRAGE_LIVESTREAM',
      description_action: `Démarrage du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Livestream démarré avec succès',
      data: livestream
    });
  } catch (error) {
    console.error('Error starting livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du démarrage du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Terminer un livestream
 * @route   PUT /api/livestreams/:id/end
 * @access  Private
 */
exports.endLiveStream = async (req, res) => {
  try {
    const livestream = await LiveStream.findById(req.params.id);
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'auteur ou un admin
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à terminer ce livestream'
      });
    }

    // Vérifier si le livestream peut être terminé
    // Pour les admins, permettre de terminer même si pas LIVE
    if (livestream.status !== 'LIVE' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: `Impossible de terminer un livestream avec le statut ${livestream.status}`
      });
    }

    // Mettre à jour le statut et l'heure de fin
    livestream.status = 'COMPLETED';
    livestream.actualEndTime = new Date();
    
    // Si l'enregistrement est activé, générer un ID de vidéo enregistrée
    if (livestream.recordAfterStream) {
      livestream.recordedVideoId = `rec_${Date.now()}_${livestream._id}`;
    }
    
    await livestream.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'FIN_LIVESTREAM',
      description_action: `Fin du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Livestream terminé avec succès',
      data: livestream
    });
  } catch (error) {
    console.error('Error ending livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la fin du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Annuler un livestream
 * @route   PUT /api/livestreams/:id/cancel
 * @access  Private
 */
exports.cancelLiveStream = async (req, res) => {
  try {
    const livestream = await LiveStream.findById(req.params.id);
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que l'utilisateur est l'auteur ou un admin
    const isAdmin = req.user.roles && (
      req.user.roles.includes('admin') || 
      req.user.roles.some(r => r === 'admin' || r.libelle_role === 'admin')
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à annuler ce livestream'
      });
    }

    // Vérifier si le livestream peut être annulé
    // Pour les admins, permettre l'annulation même si pas SCHEDULED
    if (livestream.status !== 'SCHEDULED' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: `Impossible d'annuler un livestream avec le statut ${livestream.status}`
      });
    }

    // Mettre à jour le statut
    livestream.status = 'CANCELLED';
    await livestream.save();

    // Journaliser l'action
    await LogAction.create({
      type_action: 'ANNULATION_LIVESTREAM',
      description_action: `Annulation du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Livestream annulé avec succès',
      data: livestream
    });
  } catch (error) {
    console.error('Error cancelling livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'annulation du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les livestreams en cours
 * @route   GET /api/livestreams/live
 * @access  Public
 */
exports.getLiveStreams = async (req, res) => {
  try {
    await autoStartScheduledStreams();
    await autoEndExpiredStreams();
    
    const now = new Date();
    
    const livestreams = await LiveStream.find({ 
      status: 'LIVE',
      isPublic: true,
      scheduledEndTime: { $gt: now } // Pas expirés
    })
    .sort('-actualStartTime')
    .populate('author', 'nom prenom');

    res.status(200).json({
      success: true,
      count: livestreams.length,
      data: livestreams
    });
  } catch (error) {
    console.error('Error fetching live streams:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des livestreams en cours',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les livestreams programmés
 * @route   GET /api/livestreams/scheduled
 * @access  Public
 */
exports.getScheduledLiveStreams = async (req, res) => {
  try {
    const now = new Date();
    
    const livestreams = await LiveStream.find({ 
      status: 'SCHEDULED',
      isPublic: true,
      scheduledStartTime: { $gt: now }
    })
    .sort('scheduledStartTime')
    .populate('author', 'nom prenom');

    res.status(200).json({
      success: true,
      count: livestreams.length,
      data: livestreams
    });
  } catch (error) {
    console.error('Error fetching scheduled livestreams:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des livestreams programmés',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les statistiques des livestreams
 * @route   GET /api/livestreams/admin/stats
 * @access  Private/Admin
 */
exports.getLiveStreamStats = async (req, res) => {
  try {
    // Mise à jour automatique avant statistiques
    await autoStartScheduledStreams();
    await autoEndExpiredStreams();
    
    // Nombre total de livestreams
    const total = await LiveStream.countDocuments();
    
    // Compter par statut
    const statusStats = await LiveStream.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Compter par catégorie
    const categoryStats = await LiveStream.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Compter par type de compilation
    const typeStats = await LiveStream.aggregate([
      { $group: { _id: '$compilationType', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Livestreams les plus vus
    const mostViewed = await LiveStream.find({ status: 'COMPLETED' })
      .sort('-statistics.maxConcurrentViewers')
      .limit(5)
      .select('title hostName statistics');
    
    // Durée moyenne des livestreams
    const durationStats = await LiveStream.aggregate([
      { 
        $match: { 
          status: 'COMPLETED',
          actualStartTime: { $exists: true },
          actualEndTime: { $exists: true }
        } 
      },
      {
        $project: {
          durationMinutes: {
            $divide: [
              { $subtract: ['$actualEndTime', '$actualStartTime'] },
              60000 // Millisecondes en minutes
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageDuration: { $avg: '$durationMinutes' },
          maxDuration: { $max: '$durationMinutes' },
          minDuration: { $min: '$durationMinutes' },
          totalStreams: { $sum: 1 }
        }
      }
    ]);

    // Prochains livestreams programmés
    const now = new Date();
    const upcomingStreams = await LiveStream.find({
      status: 'SCHEDULED',
      scheduledStartTime: { $gt: now }
    })
    .sort('scheduledStartTime')
    .limit(5)
    .select('title scheduledStartTime hostName compilationType');

    // Calculer le nombre total de vues
    const totalViews = await LiveStream.aggregate([
      {
        $group: {
          _id: null,
          totalUniqueViewers: { $sum: '$statistics.totalUniqueViewers' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        byStatus: statusStats,
        byCategory: categoryStats,
        byType: typeStats,
        mostViewed,
        durationStats: durationStats[0] || {
          averageDuration: 0,
          maxDuration: 0,
          minDuration: 0,
          totalStreams: 0
        },
        upcomingStreams,
        totalViews: totalViews.length > 0 ? totalViews[0].totalUniqueViewers : 0
      }
    });
  } catch (error) {
    console.error('Error fetching livestream stats:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer tous les livestreams (admin)
 * @route   GET /api/livestreams/admin/all
 * @access  Private/Admin
 */
exports.getAllLiveStreamsAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status,
      category,
      sort = '-scheduledStartTime',
      author,
      compilationType
    } = req.query;

    // Construire le filtre
    const filter = {};
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { hostName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (author) {
      filter.author = author;
    }
    
    if (compilationType) {
      filter.compilationType = compilationType;
    }

    // Compter le nombre total
    const total = await LiveStream.countDocuments(filter);
    
    // Récupérer les livestreams paginés
    const livestreams = await LiveStream.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: livestreams,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching all livestreams (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des livestreams',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les commentaires d'un livestream (pour modération)
 * @route   GET /api/livestreams/:id/comments
 * @access  Private
 */
exports.getLiveStreamComments = async (req, res) => {
  try {
    const streamId = req.params.id;
    
    // Vérifier que l'utilisateur a le droit d'accéder aux commentaires
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier les permissions (auteur ou admin)
    const isAdmin = req.user.roles && req.user.roles.some(r => 
      r === 'admin' || r.libelle_role === 'admin'
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à accéder à ces commentaires'
      });
    }
    
    // Récupérer les commentaires de la base de données
    const comments = await LiveChatMessage.find({ 
      livestreamId: streamId,
      parentId: null,
      isDeleted: false
    })
    .sort('-createdAt')
    .limit(50)
    .populate('userId', 'nom prenom photo_profil');
    
    res.status(200).json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error('Error fetching livestream comments:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des commentaires',
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer un commentaire
 * @route   DELETE /api/livestreams/:id/comments/:commentId
 * @access  Private
 */
exports.deleteComment = async (req, res) => {
  try {
    const streamId = req.params.id;
    const commentId = req.params.commentId;
    
    // Vérifier les droits d'accès
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier les permissions
    const isAdmin = req.user.roles && req.user.roles.some(r => 
      r === 'admin' || r.libelle_role === 'admin'
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modérer ce livestream'
      });
    }
    
    // Vérifier que le commentaire existe
    const comment = await LiveChatMessage.findById(commentId);
    if (!comment || comment.livestreamId.toString() !== streamId) {
      return res.status(404).json({
        success: false,
        message: 'Commentaire non trouvé'
      });
    }
    
    // Marquer le commentaire comme supprimé (soft delete)
    comment.isDeleted = true;
    comment.isModerated = true;
    comment.content = isAdmin ? "[Message supprimé par un modérateur]" : "[Message supprimé]";
    comment.moderationReason = isAdmin ? (req.body.reason || "Modération") : null;
    await comment.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'SUPPRESSION_COMMENTAIRE',
      description_action: `Suppression d'un commentaire du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: 'Commentaire supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du commentaire',
      error: error.message
    });
  }
};

/**
 * @desc    Bannir un utilisateur du chat
 * @route   POST /api/livestreams/:id/ban-user
 * @access  Private
 */
exports.banUserFromChat = async (req, res) => {
  try {
    const streamId = req.params.id;
    const { userId, reason } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur requis'
      });
    }
    
    // Vérifier si le livestream existe
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier les permissions de modération
    const isAdmin = req.user.roles && req.user.roles.some(r => 
      r === 'admin' || r.libelle_role === 'admin'
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas les droits pour modérer ce chat'
      });
    }
    
    // Ajouter l'utilisateur à la liste des bannis s'il n'y est pas déjà
    if (!livestream.bannedUsers) {
      livestream.bannedUsers = [];
    }
    
    if (!livestream.bannedUsers.includes(userId)) {
      livestream.bannedUsers.push(userId);
      await livestream.save();
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'BAN_USER_FROM_CHAT',
      description_action: `Utilisateur banni du chat du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        bannedUserId: userId,
        reason: reason || 'Non spécifié'
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Utilisateur banni du chat avec succès'
    });
  } catch (error) {
    console.error('Error banning user from chat:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du bannissement de l\'utilisateur',
      error: error.message
    });
  }
};

/**
 * @desc    Débannir un utilisateur du chat
 * @route   POST /api/livestreams/:id/unban-user
 * @access  Private
 */
exports.unbanUserFromChat = async (req, res) => {
  try {
    const streamId = req.params.id;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur requis'
      });
    }
    
    // Vérifier si le livestream existe
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier les permissions
    const isAdmin = req.user.roles && req.user.roles.some(r => 
      r === 'admin' || r.libelle_role === 'admin'
    );
    
    if (livestream.author.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas les droits pour modérer ce chat'
      });
    }
    
    // Retirer l'utilisateur de la liste des bannis
    if (livestream.bannedUsers && livestream.bannedUsers.includes(userId)) {
      livestream.bannedUsers = livestream.bannedUsers.filter(
        id => id.toString() !== userId.toString()
      );
      await livestream.save();
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'UNBAN_USER_FROM_CHAT',
      description_action: `Utilisateur réintégré dans le chat du livestream "${livestream.title}"`,
      id_user: req.user.id,
      created_by: req.user.id,
      donnees_supplementaires: {
        unbannedUserId: userId
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Utilisateur réintégré dans le chat avec succès'
    });
  } catch (error) {
    console.error('Error unbanning user from chat:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la réintégration de l\'utilisateur',
      error: error.message
    });
  }
};

module.exports = {
  getAllPublicLiveStreams: exports.getAllPublicLiveStreams,
  getLiveStreamById: exports.getLiveStreamById,
  createLiveStream: exports.createLiveStream,
  updateLiveStream: exports.updateLiveStream,
  deleteLiveStream: exports.deleteLiveStream,
  startLiveStream: exports.startLiveStream,
  endLiveStream: exports.endLiveStream,
  cancelLiveStream: exports.cancelLiveStream,
  getLiveStreams: exports.getLiveStreams,
  getScheduledLiveStreams: exports.getScheduledLiveStreams,
  getLiveStreamStats: exports.getLiveStreamStats,
  getAllLiveStreamsAdmin: exports.getAllLiveStreamsAdmin,
  getLiveStreamComments: exports.getLiveStreamComments,
  deleteComment: exports.deleteComment,
  banUserFromChat: exports.banUserFromChat,
  unbanUserFromChat: exports.unbanUserFromChat,
  // Nouvelles fonctions utilitaires
  autoUpdateStreams,
  autoStartScheduledStreams,
  autoEndExpiredStreams
};