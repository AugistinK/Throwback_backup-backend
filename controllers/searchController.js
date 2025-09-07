const mongoose = require('mongoose');
const Video = mongoose.model('Video');
const Playlist = mongoose.model('Playlist');
const Podcast = mongoose.model('Podcast');
const LiveStream = mongoose.model('LiveStream');

/**
 * @desc    Recherche globale sur tous les types de contenu
 * @route   GET /api/search
 * @access  Public
 */
exports.globalSearch = async (req, res) => {
  try {
    const { query, page = 1, limit = 10, type = 'all' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis"
      });
    }

    const searchRegex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;
    let results = {};
    let promises = [];
    
    // Définir les types de contenu à rechercher
    const contentTypes = type === 'all' 
      ? ['videos', 'playlists', 'podcasts', 'livestreams'] 
      : [type];
    
    // Recherche de vidéos
    if (contentTypes.includes('videos') || contentTypes.includes('all')) {
      const videoPromise = Video.find({
        $or: [
          { titre: searchRegex },
          { description: searchRegex },
          { artiste: searchRegex },
          { 'meta.tags': searchRegex }
        ]
      })
      .populate('auteur', 'nom prenom photo_profil')
      .sort({ vues: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec()
      .then(async (videos) => {
        const count = await Video.countDocuments({
          $or: [
            { titre: searchRegex },
            { description: searchRegex },
            { artiste: searchRegex },
            { 'meta.tags': searchRegex }
          ]
        });
        
        return {
          videos,
          count
        };
      });
      
      promises.push(videoPromise);
    }
    
    // Recherche de playlists
    if (contentTypes.includes('playlists') || contentTypes.includes('all')) {
      const playlistPromise = Playlist.find({
        $and: [
          { 
            $or: [
              { nom: searchRegex },
              { description: searchRegex },
              { tags: searchRegex }
            ]
          },
          { visibilite: 'PUBLIC' }
        ]
      })
      .populate('proprietaire', 'nom prenom photo_profil')
      .sort({ nb_lectures: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec()
      .then(async (playlists) => {
        const count = await Playlist.countDocuments({
          $and: [
            { 
              $or: [
                { nom: searchRegex },
                { description: searchRegex },
                { tags: searchRegex }
              ]
            },
            { visibilite: 'PUBLIC' }
          ]
        });
        
        return {
          playlists,
          count
        };
      });
      
      promises.push(playlistPromise);
    }
    
    // Recherche de podcasts
    if (contentTypes.includes('podcasts') || contentTypes.includes('all')) {
      const podcastPromise = Podcast.find({
        $and: [
          { 
            $or: [
              { title: searchRegex },
              { description: searchRegex },
              { guestName: searchRegex },
              { topics: searchRegex }
            ]
          },
          { isPublished: true }
        ]
      })
      .populate('author', 'nom prenom photo_profil')
      .sort({ publishDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec()
      .then(async (podcasts) => {
        const count = await Podcast.countDocuments({
          $and: [
            { 
              $or: [
                { title: searchRegex },
                { description: searchRegex },
                { guestName: searchRegex },
                { topics: searchRegex }
              ]
            },
            { isPublished: true }
          ]
        });
        
        return {
          podcasts,
          count
        };
      });
      
      promises.push(podcastPromise);
    }
    
    // Recherche de livestreams
    if (contentTypes.includes('livestreams') || contentTypes.includes('all')) {
      const livestreamPromise = LiveStream.find({
        $and: [
          { 
            $or: [
              { title: searchRegex },
              { description: searchRegex },
              { hostName: searchRegex },
              { guests: searchRegex },
              { tags: searchRegex }
            ]
          },
          { 
            $or: [
              { status: 'LIVE' },
              { status: 'SCHEDULED' }
            ]
          },
          { isPublic: true }
        ]
      })
      .populate('author', 'nom prenom photo_profil')
      .sort({ scheduledStartTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec()
      .then(async (livestreams) => {
        const count = await LiveStream.countDocuments({
          $and: [
            { 
              $or: [
                { title: searchRegex },
                { description: searchRegex },
                { hostName: searchRegex },
                { guests: searchRegex },
                { tags: searchRegex }
              ]
            },
            { 
              $or: [
                { status: 'LIVE' },
                { status: 'SCHEDULED' }
              ]
            },
            { isPublic: true }
          ]
        });
        
        return {
          livestreams,
          count
        };
      });
      
      promises.push(livestreamPromise);
    }
    
    // Exécuter toutes les recherches en parallèle
    const searchResults = await Promise.all(promises);
    
    // Organiser les résultats par type
    if (contentTypes.includes('videos') || contentTypes.includes('all')) {
      const videoResults = searchResults.shift();
      results.videos = {
        items: videoResults.videos,
        total: videoResults.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(videoResults.count / limit)
      };
    }
    
    if (contentTypes.includes('playlists') || contentTypes.includes('all')) {
      const playlistResults = searchResults.shift();
      results.playlists = {
        items: playlistResults.playlists,
        total: playlistResults.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(playlistResults.count / limit)
      };
    }
    
    if (contentTypes.includes('podcasts') || contentTypes.includes('all')) {
      const podcastResults = searchResults.shift();
      results.podcasts = {
        items: podcastResults.podcasts,
        total: podcastResults.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(podcastResults.count / limit)
      };
    }
    
    if (contentTypes.includes('livestreams') || contentTypes.includes('all')) {
      const livestreamResults = searchResults.shift();
      results.livestreams = {
        items: livestreamResults.livestreams,
        total: livestreamResults.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(livestreamResults.count / limit)
      };
    }
    
    // Ajouter des méta-informations sur la recherche
    results.meta = {
      query,
      type,
      timestamp: new Date().toISOString()
    };
    
    // Renvoyer les résultats
    return res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error("Erreur lors de la recherche globale:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la recherche",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Recherche spécifique de vidéos
 * @route   GET /api/search/videos
 * @access  Public
 */
exports.searchVideos = async (req, res) => {
  try {
    const { query, page = 1, limit = 12, genre, decennie, sort = 'relevance' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis"
      });
    }

    const searchRegex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;
    
    // Construire le filtre de recherche
    const filter = {
      $or: [
        { titre: searchRegex },
        { description: searchRegex },
        { artiste: searchRegex },
        { 'meta.tags': searchRegex }
      ]
    };
    
    // Ajouter des filtres optionnels
    if (genre) {
      filter.genre = genre;
    }
    
    if (decennie) {
      filter.decennie = decennie;
    }
    
    // Déterminer le tri
    let sortOption = {};
    switch (sort) {
      case 'views':
        sortOption = { vues: -1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'likes':
        sortOption = { likes: -1 };
        break;
      case 'relevance':
      default:
        // Tri par pertinence (basé sur la correspondance du titre, puis les vues)
        sortOption = { score: { $meta: "textScore" }, vues: -1 };
        break;
    }
    
    // Exécuter la recherche
    const videos = await Video.find(filter)
      .populate('auteur', 'nom prenom photo_profil')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();
    
    // Compter le nombre total de résultats
    const total = await Video.countDocuments(filter);
    
    return res.json({
      success: true,
      data: {
        items: videos,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      meta: {
        query,
        filters: {
          genre,
          decennie,
          sort
        }
      }
    });
    
  } catch (error) {
    console.error("Erreur lors de la recherche de vidéos:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la recherche de vidéos",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Recherche spécifique de playlists
 * @route   GET /api/search/playlists
 * @access  Public
 */
exports.searchPlaylists = async (req, res) => {
  try {
    const { query, page = 1, limit = 12, sort = 'popularity' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis"
      });
    }

    const searchRegex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;
    
    // Construire le filtre de recherche (uniquement les playlists publiques)
    const filter = {
      $and: [
        { 
          $or: [
            { nom: searchRegex },
            { description: searchRegex },
            { tags: searchRegex }
          ]
        },
        { visibilite: 'PUBLIC' }
      ]
    };
    
    // Déterminer le tri
    let sortOption = {};
    switch (sort) {
      case 'newest':
        sortOption = { creation_date: -1 };
        break;
      case 'oldest':
        sortOption = { creation_date: 1 };
        break;
      case 'favorites':
        sortOption = { nb_favoris: -1 };
        break;
      case 'popularity':
      default:
        sortOption = { nb_lectures: -1 };
        break;
    }
    
    // Exécuter la recherche
    const playlists = await Playlist.find(filter)
      .populate('proprietaire', 'nom prenom photo_profil')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();
    
    // Compter le nombre total de résultats
    const total = await Playlist.countDocuments(filter);
    
    return res.json({
      success: true,
      data: {
        items: playlists,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      meta: {
        query,
        filters: {
          sort
        }
      }
    });
    
  } catch (error) {
    console.error("Erreur lors de la recherche de playlists:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la recherche de playlists",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Recherche spécifique de podcasts
 * @route   GET /api/search/podcasts
 * @access  Public
 */
exports.searchPodcasts = async (req, res) => {
  try {
    const { query, page = 1, limit = 12, category, sort = 'newest' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis"
      });
    }

    const searchRegex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;
    
    // Construire le filtre de recherche (uniquement les podcasts publiés)
    const filter = {
      $and: [
        { 
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { guestName: searchRegex },
            { topics: searchRegex }
          ]
        },
        { isPublished: true }
      ]
    };
    
    // Ajouter des filtres optionnels
    if (category) {
      filter.category = category;
    }
    
    // Déterminer le tri
    let sortOption = {};
    switch (sort) {
      case 'popular':
        sortOption = { viewCount: -1 };
        break;
      case 'likes':
        sortOption = { likeCount: -1 };
        break;
      case 'newest':
      default:
        sortOption = { publishDate: -1 };
        break;
    }
    
    // Exécuter la recherche
    const podcasts = await Podcast.find(filter)
      .populate('author', 'nom prenom photo_profil')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();
    
    // Compter le nombre total de résultats
    const total = await Podcast.countDocuments(filter);
    
    return res.json({
      success: true,
      data: {
        items: podcasts,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      meta: {
        query,
        filters: {
          category,
          sort
        }
      }
    });
    
  } catch (error) {
    console.error("Erreur lors de la recherche de podcasts:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la recherche de podcasts",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Recherche spécifique de livestreams
 * @route   GET /api/search/livestreams
 * @access  Public
 */
exports.searchLivestreams = async (req, res) => {
  try {
    const { query, page = 1, limit = 12, status = 'all', category } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis"
      });
    }

    const searchRegex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;
    
    // Construire le filtre de recherche (uniquement les livestreams publics)
    const filter = {
      $and: [
        { 
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { hostName: searchRegex },
            { guests: searchRegex },
            { tags: searchRegex }
          ]
        },
        { isPublic: true }
      ]
    };
    
    // Filtrer par statut
    if (status !== 'all') {
      filter.status = status.toUpperCase();
    } else {
      filter.$and.push({
        $or: [
          { status: 'LIVE' },
          { status: 'SCHEDULED' }
        ]
      });
    }
    
    // Ajouter des filtres optionnels
    if (category) {
      filter.category = category;
    }
    
    // Tri: Les LIVE d'abord, puis les programmés par date
    const sortOption = { 
      status: -1, // 'LIVE' avant 'SCHEDULED'
      scheduledStartTime: 1 
    };
    
    // Exécuter la recherche
    const livestreams = await LiveStream.find(filter)
      .populate('author', 'nom prenom photo_profil')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();
    
    // Compter le nombre total de résultats
    const total = await LiveStream.countDocuments(filter);
    
    return res.json({
      success: true,
      data: {
        items: livestreams,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      meta: {
        query,
        filters: {
          status,
          category
        }
      }
    });
    
  } catch (error) {
    console.error("Erreur lors de la recherche de livestreams:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la recherche de livestreams",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Récupérer les suggestions de recherche
 * @route   GET /api/search/suggestions
 * @access  Public
 */
exports.getSearchSuggestions = async (req, res) => {
  try {
    const { query, limit = 5 } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const searchRegex = new RegExp('^' + query, 'i');
    
    // Rechercher dans les vidéos
    const videoTitles = await Video.find({ titre: searchRegex })
      .select('titre')
      .limit(limit)
      .lean();
    
    // Rechercher dans les playlists
    const playlistNames = await Playlist.find({ 
      nom: searchRegex,
      visibilite: 'PUBLIC'
    })
      .select('nom')
      .limit(limit)
      .lean();
    
    // Rechercher dans les artistes
    const artists = await Video.aggregate([
      { $match: { artiste: searchRegex } },
      { $group: { _id: '$artiste' } },
      { $limit: limit }
    ]);
    
    // Fusionner et formater les suggestions
    const suggestions = [
      ...videoTitles.map(v => ({ 
        type: 'video', 
        text: v.titre,
        query: v.titre
      })),
      ...playlistNames.map(p => ({ 
        type: 'playlist', 
        text: p.nom,
        query: p.nom
      })),
      ...artists.map(a => ({ 
        type: 'artist', 
        text: a._id,
        query: a._id
      }))
    ];
    
    // Trier par pertinence et limiter le nombre total
    const sortedSuggestions = suggestions
      .sort((a, b) => {
        // Les correspondances exactes d'abord
        if (a.text.toLowerCase() === query.toLowerCase()) return -1;
        if (b.text.toLowerCase() === query.toLowerCase()) return 1;
        
        // Puis les correspondances qui commencent par la requête
        const aStartsWith = a.text.toLowerCase().startsWith(query.toLowerCase());
        const bStartsWith = b.text.toLowerCase().startsWith(query.toLowerCase());
        
        if (aStartsWith && !bStartsWith) return -1;
        if (bStartsWith && !aStartsWith) return 1;
        
        // Enfin par longueur (les plus courts d'abord)
        return a.text.length - b.text.length;
      })
      .slice(0, limit);
    
    return res.json({
      success: true,
      data: sortedSuggestions
    });
    
  } catch (error) {
    console.error("Erreur lors de la récupération des suggestions:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des suggestions",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};