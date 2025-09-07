// controllers/publicVideoController.js
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const Playlist = require('../models/Playlist');
const Like = require('../models/Like');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Get all public videos with filters, search and pagination
 * @route   GET /api/public/videos
 * @access  Public
 */
exports.getPublicVideos = async (req, res, next) => {
  try {
    const { 
      type, 
      genre,
      decade, 
      search = '', 
      sortBy = 'recent',
      page = 1, 
      limit = 12 
    } = req.query;
    
    console.log(' Récupération des vidéos publiques avec filtres:', { type, genre, decade, search, sortBy });
    
    // Build filter object
    const filter = {};
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (genre && genre !== 'all') {
      filter.genre = genre;
    }
    
    if (decade && decade !== 'all') {
      filter.decennie = decade;
    }
    
    // Search functionality
    if (search.trim()) {
      filter.$or = [
        { titre: new RegExp(search, 'i') },
        { artiste: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { 'meta.tags': new RegExp(search, 'i') }
      ];
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'popular':
        sortOptions = { vues: -1, likes: -1 };
        break;
      case 'mostLiked':
        sortOptions = { likes: -1, vues: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'recent':
      default:
        sortOptions = { createdAt: -1 };
        break;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total documents
    const total = await Video.countDocuments(filter);
    
    // Get videos
    const videos = await Video.find(filter)
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists'); 
    
    console.log(` ${videos.length} vidéos trouvées sur ${total} au total`);
    
    
    let userLikes = [];
    if (req.user && req.user._id) {
      try {
        const videoIds = videos.map(v => v._id);
        console.log(' Utilisateur connecté, vérification des likes pour:', req.user._id);
        
        
        userLikes = await Like.find({
          video_id: { $in: videoIds },  
          utilisateur: req.user._id    
        }).select('video_id type_like');
        
        console.log(` ${userLikes.length} likes trouvés pour l'utilisateur`);
      } catch (likeError) {
        console.warn(' Erreur lors de la récupération des likes (non critique):', likeError.message);
        userLikes = [];
      }
    }
    
    
    const videosWithInteraction = videos.map(video => {
      try {
        const videoObj = video.toObject();
        
        if (req.user && req.user._id) {
        
          const userLike = userLikes.find(like => 
            like && 
            like.video_id && 
            like.video_id.toString() === video._id.toString() 
          );
          
          videoObj.userInteraction = {
            liked: userLike?.type_like === 'LIKE',
            disliked: userLike?.type_like === 'DISLIKE'
          };
        } else {
          videoObj.userInteraction = {
            liked: false,
            disliked: false
          };
        }
        
        return videoObj;
      } catch (videoError) {
        console.warn(' Erreur lors du traitement d\'une vidéo:', videoError.message);
        // Retourner la vidéo sans interactions en cas d'erreur
        const videoObj = video.toObject();
        videoObj.userInteraction = { liked: false, disliked: false };
        return videoObj;
      }
    });
    
    res.json({
      success: true,
      data: videosWithInteraction,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: page < Math.ceil(total / parseInt(limit)),
        hasPrevPage: page > 1
      },
      filters: {
        availableGenres: Video.GENRES || ['Rock', 'Pop', 'Jazz', 'Blues', 'Country', 'Hip-Hop', 'Electronic', 'Classical'],
        availableDecades: ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'],
        availableTypes: ['music', 'podcast', 'short']
      }
    });
  } catch (err) {
    console.error(' Error getting public videos:', err);
    console.error(' Stack trace:', err.stack);
    
    // Réponse d'erreur sécurisée
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des vidéos',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @desc    Get a single video by ID with related videos
 * @route   GET /api/public/videos/:id
 * @access  Public
 */
exports.getVideoById = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    console.log(' Récupération de la vidéo:', videoId);
    
    // Valider l'ID MongoDB
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de vidéo invalide'
      });
    }
    
    // Get the video
    const video = await Video.findById(videoId)
      .populate('auteur', 'nom prenom photo_profil');
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    console.log('✅ Vidéo trouvée:', video.titre);
    
    // Increment view count (only once per user per day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let shouldIncrementView = true;
    if (req.user && req.user._id) {
      try {
        // Check if user already viewed today
        const existingView = await LogAction.findOne({
          type_action: 'VIDEO_VIEW',
          id_user: req.user._id,
          'donnees_supplementaires.video_id': videoId,
          creation_date: { $gte: today }
        });
        
        shouldIncrementView = !existingView;
      } catch (viewError) {
        console.warn('⚠️ Erreur lors de la vérification des vues:', viewError.message);
      }
    }
    
    if (shouldIncrementView) {
      video.vues = (video.vues || 0) + 1;
      await video.save();
      
      // Log the view
      if (req.user && req.user._id) {
        try {
          await LogAction.create({
            type_action: 'VIDEO_VIEW',
            description_action: `Viewed video: ${video.titre}`,
            id_user: req.user._id,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            created_by: req.user._id,
            donnees_supplementaires: {
              video_id: videoId,
              video_titre: video.titre
            }
          });
        } catch (logError) {
          console.warn('⚠️ Erreur lors du logging de vue:', logError.message);
        }
      }
    }
    
    // Get related videos (same genre or artist, excluding current video)
    const relatedFilter = { 
      _id: { $ne: videoId }
    };
    
    if (video.genre) {
      relatedFilter.genre = video.genre;
    } else if (video.artiste) {
      relatedFilter.artiste = new RegExp(video.artiste, 'i');
    } else {
      relatedFilter.type = video.type;
    }
    
    const relatedVideos = await Video.find(relatedFilter)
      .populate('auteur', 'nom prenom')
      .limit(6)
      .select('titre artiste type genre youtubeUrl vues likes annee decennie')
      .sort({ vues: -1, likes: -1 });
    
    // ⚠️ CORRECTION: Vérifier les interactions utilisateur avec sécurité
    let userInteraction = { liked: false, disliked: false };
    if (req.user && req.user._id) {
      try {
        // ⚠️ CORRECTION: Utiliser video_id et utilisateur
        const userLike = await Like.findOne({
          video_id: videoId,        // Utiliser video_id
          utilisateur: req.user._id // Utiliser utilisateur
        });
        
        if (userLike) {
          userInteraction = {
            liked: userLike.type_like === 'LIKE',
            disliked: userLike.type_like === 'DISLIKE'
          };
        }
      } catch (likeError) {
        console.warn('⚠️ Erreur lors de la récupération de l\'interaction utilisateur:', likeError.message);
      }
    }
    
    const videoObj = video.toObject();
    videoObj.userInteraction = userInteraction;
    
    res.json({
      success: true,
      data: videoObj,
      related: relatedVideos
    });
  } catch (err) {
    console.error('❌ Error getting video:', err);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération de la vidéo',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @desc    Liker/Unliker une vidéo
 * @route   POST /api/videos/:id/like
 * @access  Private
 */
exports.likeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    console.log(' Tentative de like:');
    console.log(' Video ID:', videoId);
    console.log(' User ID:', userId);
    
    // Vérifier que la vidéo existe
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Vidéo non trouvée'
      });
    }
    
    // Vérifier si un like existe déjà pour cet utilisateur et cette vidéo
    let existingLike = await Like.findOne({
      video_id: videoId,
      utilisateur: userId  
    });
    
    console.log('🔍 Like existant trouvé:', existingLike ? 'Oui' : 'Non');
    
    let liked = false;
    let likesCount = video.likes || 0;
    
    if (existingLike) {
      // L'utilisateur a déjà liké, on retire le like
      await Like.deleteOne({ _id: existingLike._id });
      likesCount = Math.max(0, likesCount - 1);
      liked = false;
      console.log('👎 Like retiré');
    } else {
      // Créer un nouveau like avec la structure correcte
      const newLike = new Like({
        video_id: videoId,
        utilisateur: userId,  
        type_like: 'LIKE',
        created_by: userId
      });
      
      await newLike.save();
      likesCount = likesCount + 1;
      liked = true;
      console.log('👍 Nouveau like créé');
    }
    
    // Mettre à jour le compteur de likes dans la vidéo
    video.likes = likesCount;
    await video.save();
    
    // Logger l'action
    try {
      await LogAction.create({
        type_action: liked ? "VIDEO_LIKEE" : "VIDEO_UNLIKEE",
        description_action: `${liked ? 'Like ajouté' : 'Like retiré'} sur la vidéo "${video.titre}"`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          video_id: videoId,
          video_titre: video.titre
        }
      });
    } catch (logError) {
      console.warn('⚠️ Erreur lors du logging (non critique):', logError.message);
    }
    
    res.json({
      success: true,
      message: liked ? 'Vidéo likée avec succès' : 'Like retiré avec succès',
      data: {
        liked: liked,
        disliked: false, 
        likes: likesCount,
        dislikes: video.dislikes || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du like:', error);
    
    // Si c'est une erreur de validation, donner plus de détails
    if (error.name === 'ValidationError') {
      console.error('📋 Détails de validation:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation lors du like',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur interne lors du like'
    });
  }
};

/**
 * @desc    Disliker/Undisliker une vidéo  
 * @route   POST /api/videos/:id/dislike
 * @access  Private
 */
exports.dislikeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    console.log(' Tentative de dislike:');
    console.log(' Video ID:', videoId);
    console.log(' User ID:', userId);
    
    // Vérifier que la vidéo existe
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Vidéo non trouvée'
      });
    }
    
    // Vérifier si un dislike existe déjà
    let existingDislike = await Like.findOne({
      video_id: videoId,
      utilisateur: userId,  
      type_like: 'DISLIKE'
    });
    
    let disliked = false;
    let dislikesCount = video.dislikes || 0;
    
    if (existingDislike) {
      // Retirer le dislike
      await Like.deleteOne({ _id: existingDislike._id });
      dislikesCount = Math.max(0, dislikesCount - 1);
      disliked = false;
    } else {
      // Ajouter un dislike
      const newDislike = new Like({
        video_id: videoId,
        utilisateur: userId,  
        type_like: 'DISLIKE',
        created_by: userId
      });
      
      await newDislike.save();
      dislikesCount = dislikesCount + 1;
      disliked = true;
    }
    
    // Mettre à jour la vidéo
    video.dislikes = dislikesCount;
    await video.save();
    
    res.json({
      success: true,
      message: disliked ? 'Vidéo dislikée avec succès' : 'Dislike retiré avec succès',
      data: {
        liked: false,
        disliked: disliked,
        likes: video.likes || 0,
        dislikes: dislikesCount
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du dislike:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne lors du dislike'
    });
  }
};

/**
 * @desc    Get trending videos
 * @route   GET /api/public/videos/trending
 * @access  Public
 */
exports.getTrendingVideos = async (req, res, next) => {
  try {
    const { limit = 10, period = 'week' } = req.query;
    
    // Calculate date range for trending
    const now = new Date();
    let dateLimit;
    
    switch (period) {
      case 'day':
        dateLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'week':
      default:
        dateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
    
    // Get trending videos based on recent views and likes
    const trendingVideos = await Video.aggregate([
      {
        $match: {
          createdAt: { $gte: dateLimit }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$vues", 1] },
              { $multiply: ["$likes", 2] },
              { $multiply: [{ $subtract: ["$likes", "$dislikes"] }, 1.5] }
            ]
          }
        }
      },
      {
        $sort: { trendingScore: -1, createdAt: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $lookup: {
          from: 'users',
          localField: 'auteur',
          foreignField: '_id',
          as: 'auteur',
          pipeline: [
            { $project: { nom: 1, prenom: 1 } }
          ]
        }
      },
      {
        $unwind: '$auteur'
      },
      {
        $project: {
          'meta.favorisBy': 0,
          'meta.playlists': 0,
          trendingScore: 0
        }
      }
    ]);
    
    res.json({
      success: true,
      data: trendingVideos,
      period,
      message: `Trending videos for the last ${period}`
    });
  } catch (err) {
    console.error('Error getting trending videos:', err);
    next(err);
  }
};

/**
 * @desc    Get videos by genre
 * @route   GET /api/public/videos/genre/:genre
 * @access  Public
 */
exports.getVideosByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 12, sortBy = 'popular' } = req.query;
    
    const availableGenres = Video.GENRES || ['Rock', 'Pop', 'Jazz', 'Blues', 'Country', 'Hip-Hop', 'Electronic', 'Classical'];
    
    // Validate genre
    if (!availableGenres.includes(genre)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid genre',
        availableGenres
      });
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'recent':
        sortOptions = { createdAt: -1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'popular':
      default:
        sortOptions = { vues: -1, likes: -1 };
        break;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments({ genre });
    
    const videos = await Video.find({ genre })
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      genre,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting videos by genre:', err);
    next(err);
  }
};

/**
 * @desc    Get videos by decade
 * @route   GET /api/public/videos/decade/:decade
 * @access  Public
 */
exports.getVideosByDecade = async (req, res, next) => {
  try {
    const { decade } = req.params;
    const { page = 1, limit = 12, sortBy = 'popular' } = req.query;
    
    const validDecades = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
    if (!validDecades.includes(decade)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid decade',
        availableDecades: validDecades
      });
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'recent':
        sortOptions = { createdAt: -1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'chronological':
        sortOptions = { annee: 1 };
        break;
      case 'popular':
      default:
        sortOptions = { vues: -1, likes: -1 };
        break;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments({ decennie: decade });
    
    const videos = await Video.find({ decennie: decade })
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      decade,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting videos by decade:', err);
    next(err);
  }
};

/**
 * @desc    Search videos
 * @route   GET /api/public/videos/search
 * @access  Public
 */
exports.searchVideos = async (req, res, next) => {
  try {
    const { 
      q: query, 
      type, 
      genre, 
      decade,
      page = 1, 
      limit = 12 
    } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }
    
    // Build search filter
    const filter = {
      $or: [
        { titre: new RegExp(query, 'i') },
        { artiste: new RegExp(query, 'i') },
        { description: new RegExp(query, 'i') },
        { 'meta.tags': new RegExp(query, 'i') }
      ]
    };
    
    // Add additional filters
    if (type && type !== 'all') filter.type = type;
    if (genre && genre !== 'all') filter.genre = genre;
    if (decade && decade !== 'all') filter.decennie = decade;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments(filter);
    
    const videos = await Video.find(filter)
      .populate('auteur', 'nom prenom')
      .sort({ vues: -1, likes: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      query,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error searching videos:', err);
    next(err);
  }
};