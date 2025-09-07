// controllers/userPodcastController.js
const Podcast = require('../models/Podcast');
const Memory = require('../models/Memory');
const Bookmark = require('../models/Bookmark');
const Playlist = require('../models/Playlist');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer tous les podcasts pour l'utilisateur
 * @route   GET /api/podcasts/user
 * @access  Public
 */
exports.getUserPodcasts = async (req, res) => {
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

    console.log('Podcast filter:', filter);

    // Compter le nombre total
    const total = await Podcast.countDocuments(filter);
    
    // Récupérer les podcasts paginés
    const podcasts = await Podcast.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');

    // Rechercher le podcast en vedette 
    const featuredPodcast = await Podcast.findOne({ 
      isPublished: true,
      isHighlighted: true 
    }).populate('author', 'nom prenom');

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: podcasts,
      featuredPodcast: featuredPodcast || (podcasts.length > 0 ? podcasts[0] : null),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching user podcasts:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer un podcast par ID avec interactions utilisateur
 * @route   GET /api/podcasts/user/:podcastId
 * @access  Public/Private
 */
exports.getUserPodcastById = async (req, res) => {
  try {
    const { podcastId } = req.params;
    
    // Validation supplémentaire pour s'assurer que l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(podcastId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de podcast invalide'
      });
    }
    
    console.log(`Fetching podcast details, ID: ${podcastId}`);
    
    const podcast = await Podcast.findById(podcastId)
      .populate('author', 'nom prenom');
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }

    // Incrémenter le compteur de vues
    podcast.viewCount = (podcast.viewCount || 0) + 1;
    await podcast.save();

    // Ajouter l'interaction de l'utilisateur si connecté
    let userInteraction = null;
    
    if (req.user) {
      // Vérifier si l'utilisateur a aimé le podcast
      const isLiked = podcast.likes && podcast.likes.includes(req.user.id);
      
      // Vérifier si l'utilisateur a mis en favori le podcast
      const isBookmarked = await Bookmark.findOne({
        user: req.user.id,
        podcast: podcast._id,
        type: 'PODCAST'
      });
      
      userInteraction = {
        liked: isLiked,
        bookmarked: !!isBookmarked
      };
    }

    res.status(200).json({
      success: true,
      data: {
        ...podcast.toObject(),
        userInteraction
      }
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
 * @desc    Récupérer les podcasts populaires
 * @route   GET /api/podcasts/user/popular
 * @access  Public
 */
exports.getPopularPodcasts = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const podcasts = await Podcast.find({ isPublished: true })
      .sort({ viewCount: -1, likeCount: -1 })
      .limit(parseInt(limit))
      .populate('author', 'nom prenom');
    
    res.status(200).json({
      success: true,
      data: podcasts
    });
  } catch (error) {
    console.error('Error fetching popular podcasts:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts populaires',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les saisons disponibles
 * @route   GET /api/podcasts/user/seasons
 * @access  Public
 */
exports.getAvailableSeasons = async (req, res) => {
  try {
    const seasons = await Podcast.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$season', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: seasons.map(s => ({
        season: s._id,
        episodeCount: s.count
      }))
    });
  } catch (error) {
    console.error('Error fetching seasons:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des saisons',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les catégories disponibles
 * @route   GET /api/podcasts/user/categories
 * @access  Public
 */
exports.getAvailableCategories = async (req, res) => {
  try {
    const categories = await Podcast.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: categories.map(c => ({
        category: c._id,
        episodeCount: c.count
      }))
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des catégories',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les podcasts par catégorie
 * @route   GET /api/podcasts/user/category/:category
 * @access  Public
 */
exports.getPodcastsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, sort = '-publishDate' } = req.query;
    
    const filter = { 
      isPublished: true,
      category: category 
    };
    
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
    console.error('Error fetching podcasts by category:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts par catégorie',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les podcasts par saison
 * @route   GET /api/podcasts/user/season/:season
 * @access  Public
 */
exports.getPodcastsBySeason = async (req, res) => {
  try {
    const { season } = req.params;
    const { page = 1, limit = 10, sort = '-publishDate' } = req.query;
    
    const filter = { 
      isPublished: true,
      season: parseInt(season)
    };
    
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
    console.error('Error fetching podcasts by season:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des podcasts par saison',
      error: error.message
    });
  }
};

/**
 * @desc    Liker un podcast
 * @route   POST /api/podcasts/user/:podcastId/like
 * @access  Private
 */
exports.likePodcast = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const userId = req.user.id;
    
    console.log(`Like podcast request: podcastId=${podcastId}, userId=${userId}`);
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // S'assurer que le tableau likes existe
    if (!podcast.likes) {
      podcast.likes = [];
    }
    
    // Vérifier si l'utilisateur a déjà aimé ce podcast
    const alreadyLiked = podcast.likes.includes(userId);
    let newLikeStatus = false;
    
    if (alreadyLiked) {
      // Retirer le like
      podcast.likes = podcast.likes.filter(id => id.toString() !== userId);
      podcast.likeCount = Math.max(0, (podcast.likeCount || 0) - 1);
      newLikeStatus = false;
      
      // Journaliser l'action
      await LogAction.create({
        type_action: 'UNLIKE_PODCAST',
        description_action: `Unlike du podcast "${podcast.title}"`,
        id_user: userId,
        created_by: userId,
        donnees_supplementaires: { podcast_id: podcastId }
      });
    } else {
      // Ajouter le like
      podcast.likes.push(userId);
      podcast.likeCount = (podcast.likeCount || 0) + 1;
      newLikeStatus = true;
      
      // Journaliser l'action
      await LogAction.create({
        type_action: 'LIKE_PODCAST',
        description_action: `Like du podcast "${podcast.title}"`,
        id_user: userId,
        created_by: userId,
        donnees_supplementaires: { podcast_id: podcastId }
      });
    }
    
    await podcast.save();
    
    res.status(200).json({
      success: true,
      message: newLikeStatus ? 'Podcast liké avec succès' : 'Like retiré avec succès',
      data: {
        liked: newLikeStatus,
        likeCount: podcast.likeCount
      }
    });
  } catch (error) {
    console.error('Error liking podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du like/unlike du podcast',
      error: error.message
    });
  }
};

/**
 * @desc    Mettre un podcast en favori
 * @route   POST /api/podcasts/user/:podcastId/bookmark
 * @access  Private
 */
exports.bookmarkPodcast = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const userId = req.user.id;
    
    console.log(`Bookmark podcast request: podcastId=${podcastId}, userId=${userId}`);
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // Vérifier si le podcast est déjà dans les favoris
    const existingBookmark = await Bookmark.findOne({
      user: userId,
      podcast: podcastId,
      type: 'PODCAST'
    });
    
    if (existingBookmark) {
      // Si déjà en favori, le retirer
      console.log("Removing existing bookmark:", existingBookmark._id);
      await Bookmark.findByIdAndDelete(existingBookmark._id);
      
      // Journaliser l'action
      await LogAction.create({
        type_action: 'REMOVE_BOOKMARK_PODCAST',
        description_action: `Retrait du podcast "${podcast.title}" des favoris`,
        id_user: userId,
        created_by: userId,
        donnees_supplementaires: { podcast_id: podcastId }
      });
      
      return res.status(200).json({
        success: true,
        message: 'Podcast retiré des favoris',
        data: { bookmarked: false }
      });
    } else {
      // Sinon, l'ajouter aux favoris
      console.log("Creating new bookmark for podcast:", podcastId);
      const bookmark = new Bookmark({
        user: userId,
        podcast: podcastId,
        type: 'PODCAST',
        // Important: ne pas définir video pour éviter les conflits d'index
      });
      
      await bookmark.save();
      
      // Journaliser l'action
      await LogAction.create({
        type_action: 'ADD_BOOKMARK_PODCAST',
        description_action: `Ajout du podcast "${podcast.title}" aux favoris`,
        id_user: userId,
        created_by: userId,
        donnees_supplementaires: { podcast_id: podcastId }
      });
      
      return res.status(200).json({
        success: true,
        message: 'Podcast ajouté aux favoris',
        data: { bookmarked: true }
      });
    }
  } catch (error) {
    console.error('Error bookmarking podcast:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour des favoris',
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter une mémoire à un podcast
 * @route   POST /api/podcasts/user/:podcastId/memory
 * @access  Private
 */
exports.addPodcastMemory = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const { content, type = 'posted' } = req.body;
    const userId = req.user.id;
    
    console.log(`Add memory request: podcastId=${podcastId}, userId=${userId}, content=${content}`);
    
    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Le contenu est requis'
      });
    }
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // Créer la mémoire
    const memory = new Memory({
      contenu: content.trim(),
      auteur: userId,
      podcast: podcastId,
      type: type
    });
    
    await memory.save();
    
    // Mettre à jour le compteur de commentaires du podcast
    podcast.commentCount = (podcast.commentCount || 0) + 1;
    await podcast.save();
    
    // Récupérer les infos de l'utilisateur pour la réponse
    const user = await mongoose.model('User').findById(userId)
      .select('nom prenom photo_profil');
    
    // Formater la réponse
    const formattedMemory = {
      id: memory._id,
      username: user ? `${user.prenom} ${user.nom}`.trim() : 'Utilisateur',
      imageUrl: user?.photo_profil || '/images/default-avatar.jpg',
      content: memory.contenu,
      videoArtist: podcast.hostName,
      videoTitle: podcast.title,
      videoYear: new Date(podcast.publishDate).getFullYear().toString(),
      likes: 0,
      comments: 0,
      type: memory.type,
      date: memory.createdAt
    };
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'ADD_PODCAST_MEMORY',
      description_action: `Ajout d'une mémoire au podcast "${podcast.title}"`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: { podcast_id: podcastId }
    });
    
    res.status(201).json({
      success: true,
      message: 'Mémoire ajoutée avec succès',
      data: formattedMemory
    });
  } catch (error) {
    console.error('Error adding podcast memory:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'ajout de la mémoire',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les mémoires d'un podcast
 * @route   GET /api/podcasts/user/:podcastId/memories
 * @access  Public
 */
exports.getPodcastMemories = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    console.log(`Get memories request: podcastId=${podcastId}`);
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // Récupérer les mémoires
    const memories = await Memory.find({ podcast: podcastId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('auteur', 'nom prenom photo_profil');
    
    // Formater les mémoires pour la réponse
    const formattedMemories = memories.map(memory => ({
      id: memory._id,
      username: memory.auteur ? `${memory.auteur.prenom} ${memory.auteur.nom}`.trim() : 'Utilisateur',
      imageUrl: memory.auteur?.photo_profil || '/images/default-avatar.jpg',
      content: memory.contenu,
      videoArtist: podcast.hostName,
      videoTitle: podcast.title,
      videoYear: new Date(podcast.publishDate).getFullYear().toString(),
      likes: memory.likes || 0,
      comments: memory.comments || 0,
      type: memory.type,
      date: memory.createdAt
    }));
    
    res.status(200).json({
      success: true,
      data: formattedMemories
    });
  } catch (error) {
    console.error('Error fetching podcast memories:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des mémoires',
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter un podcast à une playlist
 * @route   POST /api/podcasts/user/:podcastId/playlist
 * @access  Private
 */
exports.addPodcastToPlaylist = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const { playlistId } = req.body;
    const userId = req.user.id;
    
    console.log(`Add to playlist request: podcastId=${podcastId}, playlistId=${playlistId}, userId=${userId}`);
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // Vérifier si la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({ 
      _id: playlistId,
      proprietaire: userId 
    });
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist non trouvée ou vous n\'êtes pas autorisé à la modifier'
      });
    }
    
    // Vérifier si le podcast est déjà dans la playlist
    const existsInPlaylist = playlist.videos && playlist.videos.some(item => 
      item.video_id && item.video_id.toString() === podcastId.toString()
    );
    
    if (existsInPlaylist) {
      return res.status(400).json({
        success: false,
        message: 'Ce podcast est déjà dans la playlist'
      });
    }
    
    // Ajouter le podcast à la playlist
    if (!playlist.videos) {
      playlist.videos = [];
    }
    
    playlist.videos.push({
      video_id: podcastId,
      ordre: playlist.videos.length + 1,
      date_ajout: Date.now(),
      ajoute_par: userId
    });
    
    await playlist.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'ADD_PODCAST_TO_PLAYLIST',
      description_action: `Ajout du podcast "${podcast.title}" à la playlist "${playlist.nom}"`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: { 
        podcast_id: podcastId,
        playlist_id: playlistId
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Podcast ajouté à la playlist avec succès'
    });
  } catch (error) {
    console.error('Error adding podcast to playlist:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'ajout du podcast à la playlist',
      error: error.message
    });
  }
};

/**
 * @desc    Créer une nouvelle playlist
 * @route   POST /api/podcasts/user/playlists
 * @access  Private
 */
exports.createPlaylist = async (req, res) => {
  try {
    const { nom, description, visibility = 'PUBLIC', podcastId } = req.body;
    const userId = req.user.id;
    
    console.log(`Create playlist request: nom=${nom}, podcastId=${podcastId}, userId=${userId}`);
    
    if (!nom || nom.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Le nom de la playlist est requis'
      });
    }
    
    // Créer la playlist
    const playlist = new Playlist({
      nom: nom.trim(),
      description: description?.trim(),
      proprietaire: userId,
      visibilite: visibility,
      videos: [],
      created_by: userId
    });
    
    // Si un podcastId est fourni, l'ajouter à la playlist
    if (podcastId) {
      // Vérifier si le podcast existe
      const podcast = await Podcast.findById(podcastId);
      
      if (podcast) {
        playlist.videos.push({
          video_id: podcastId,
          ordre: 1,
          date_ajout: Date.now(),
          ajoute_par: userId
        });
      }
    }
    
    await playlist.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'CREATE_PLAYLIST',
      description_action: `Création de la playlist "${nom}"`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: { playlist_id: playlist._id }
    });
    
    res.status(201).json({
      success: true,
      message: 'Playlist créée avec succès',
      data: playlist
    });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la création de la playlist',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les playlists de l'utilisateur
 * @route   GET /api/podcasts/user/playlists
 * @access  Private
 */
exports.getUserPlaylists = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`Get user playlists request: userId=${userId}`);
    
    const playlists = await Playlist.find({ proprietaire: userId })
      .sort({ creation_date: -1 });
    
    res.status(200).json({
      success: true,
      data: playlists
    });
  } catch (error) {
    console.error('Error fetching user playlists:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des playlists',
      error: error.message
    });
  }
};

/**
 * @desc    Partager un podcast (journaliser l'action)
 * @route   POST /api/podcasts/user/:podcastId/share
 * @access  Private
 */
exports.sharePodcast = async (req, res) => {
  try {
    const { podcastId } = req.params;
    const { platform = 'other' } = req.body;
    const userId = req.user.id;
    
    console.log(`Share podcast request: podcastId=${podcastId}, platform=${platform}, userId=${userId}`);
    
    // Vérifier si le podcast existe
    const podcast = await Podcast.findById(podcastId);
    
    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'Podcast non trouvé'
      });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: 'SHARE_PODCAST',
      description_action: `Partage du podcast "${podcast.title}" sur ${platform}`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: { 
        podcast_id: podcastId,
        platform
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Partage enregistré avec succès'
    });
  } catch (error) {
    console.error('Error sharing podcast:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'enregistrement du partage',
      error: error.message
    });
  }
};