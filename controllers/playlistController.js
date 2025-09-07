// controllers/playlistController.js
const Playlist = require('../models/Playlist');
const Video = require('../models/Video');
const User = require('../models/User');
const mongoose = require('mongoose');
const LogAction = require('../models/LogAction');

/**
 * @desc    Récupérer toutes les playlists (avec pagination et filtres)
 * @route   GET /api/admin/playlists
 * @access  Admin
 */
exports.getAllPlaylists = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filtres
    const filter = {};
    
    if (req.query.search) {
      filter.$or = [
        { nom: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { tags: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.userId) {
      filter.proprietaire = req.query.userId;
    }
    
    if (req.query.visibilite) {
      filter.visibilite = req.query.visibilite;
    }
    
    if (req.query.type) {
      filter.type_playlist = req.query.type;
    }

    // Comptage total pour pagination
    const total = await Playlist.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Récupération des playlists
    const playlists = await Playlist.find(filter)
      .populate('proprietaire', 'nom prenom email photo_profil')
      .sort({ creation_date: -1 })
      .skip(skip)
      .limit(limit);
    
    // Ajouter le nombre de vidéos à chaque playlist
    const playlistsWithVideoCount = playlists.map(playlist => {
      const playlistObj = playlist.toObject();
      playlistObj.nb_videos = playlist.videos.length;
      return playlistObj;
    });
    
    res.status(200).json({
      success: true,
      data: {
        playlists: playlistsWithVideoCount,
        pagination: {
          current: page,
          total: totalPages,
          totalItems: total
        }
      }
    });
  } catch (error) {
    console.error("Erreur getAllPlaylists:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des playlists",
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les statistiques des playlists
 * @route   GET /api/admin/playlists/stats
 * @access  Admin
 */
exports.getPlaylistStats = async (req, res) => {
  try {
    // Nombre total de playlists
    const totalPlaylists = await Playlist.countDocuments();
    
    // Playlists par type
    const playlistsByType = await Playlist.aggregate([
      { $group: { _id: "$type_playlist", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Playlists par visibilité
    const playlistsByVisibility = await Playlist.aggregate([
      { $group: { _id: "$visibilite", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Top 5 des playlists les plus populaires (par nombre de lectures)
    const topPlaylists = await Playlist.find()
      .populate('proprietaire', 'nom prenom')
      .sort({ nb_lectures: -1 })
      .limit(5)
      .select('nom proprietaire nb_lectures nb_favoris');
    
    // Évolution du nombre de playlists créées par mois
    const playlistsCreationTrend = await Playlist.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$creation_date" },
            month: { $month: "$creation_date" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Utilisateurs avec le plus de playlists
    const topPlaylistCreators = await Playlist.aggregate([
      { $group: { _id: "$proprietaire", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    // Récupérer les informations des utilisateurs
    const userIds = topPlaylistCreators.map(creator => creator._id);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id nom prenom email photo_profil');
    
    // Associer les informations utilisateurs
    const topCreatorsWithInfo = topPlaylistCreators.map(creator => {
      const user = users.find(u => u._id.toString() === creator._id.toString());
      return {
        user: user || { _id: creator._id, nom: 'Utilisateur inconnu' },
        count: creator.count
      };
    });
    
    // Formater les données de tendance pour le graphique
    const formattedTrends = playlistsCreationTrend.map(item => ({
      date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
      count: item.count
    }));
    
    res.status(200).json({
      success: true,
      data: {
        totalPlaylists,
        playlistsByType,
        playlistsByVisibility,
        topPlaylists,
        playlistsCreationTrend: formattedTrends,
        topPlaylistCreators: topCreatorsWithInfo
      }
    });
  } catch (error) {
    console.error("Erreur getPlaylistStats:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des statistiques",
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer une playlist par ID
 * @route   GET /api/admin/playlists/:id
 * @access  Admin
 */
exports.getPlaylistById = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate('proprietaire', 'nom prenom email photo_profil')
      .populate('videos.video_id', 'titre youtubeUrl type duree description artiste')
      .populate('videos.ajoute_par', 'nom prenom')
      .populate('collaborateurs.utilisateur', 'nom prenom email photo_profil');
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    res.status(200).json({
      success: true,
      data: playlist
    });
  } catch (error) {
    console.error("Erreur getPlaylistById:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération de la playlist",
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour une playlist
 * @route   PUT /api/admin/playlists/:id
 * @access  Admin
 */
exports.updatePlaylist = async (req, res) => {
  try {
    const { nom, description, visibilite, tags, image_couverture } = req.body;
    
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Mise à jour des champs modifiables
    if (nom) playlist.nom = nom;
    if (description) playlist.description = description;
    if (visibilite) playlist.visibilite = visibilite;
    if (tags) playlist.tags = tags;
    if (image_couverture) playlist.image_couverture = image_couverture;
    
    playlist.modified_by = req.user.id;
    playlist.modified_date = Date.now();
    
    await playlist.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "MODIFICATION_PLAYLIST",
      description_action: `Playlist "${playlist.nom}" (${playlist._id}) modifiée par un administrateur`,
      id_user: req.user.id,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        proprietaire_id: playlist.proprietaire
      },
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Playlist mise à jour avec succès",
      data: playlist
    });
  } catch (error) {
    console.error("Erreur updatePlaylist:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour de la playlist",
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer une playlist
 * @route   DELETE /api/admin/playlists/:id
 * @access  Admin
 */
exports.deletePlaylist = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    const playlistName = playlist.nom;
    const proprietaireId = playlist.proprietaire;
    
    await playlist.deleteOne();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "SUPPRESSION_PLAYLIST",
      description_action: `Playlist "${playlistName}" (${req.params.id}) supprimée par un administrateur`,
      id_user: req.user.id,
      donnees_supplementaires: {
        playlist_id: req.params.id,
        proprietaire_id: proprietaireId
      },
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Playlist supprimée avec succès"
    });
  } catch (error) {
    console.error("Erreur deletePlaylist:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la playlist",
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter une vidéo à une playlist
 * @route   POST /api/admin/playlists/:id/videos
 * @access  Admin
 */
exports.addVideoToPlaylist = async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "L'ID de la vidéo est requis"
      });
    }
    
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier si la vidéo existe
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée"
      });
    }
    
    // Vérifier si la vidéo est déjà dans la playlist
    const videoExists = playlist.videos.some(v => v.video_id.toString() === videoId);
    
    if (videoExists) {
      return res.status(400).json({
        success: false,
        message: "Cette vidéo est déjà dans la playlist"
      });
    }
    
    // Ajouter la vidéo
    await playlist.ajouterVideo(videoId, req.user.id);
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "AJOUT_VIDEO_PLAYLIST",
      description_action: `Vidéo "${video.titre}" (${videoId}) ajoutée à la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
      id_user: req.user.id,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        video_id: videoId,
        proprietaire_id: playlist.proprietaire
      },
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Vidéo ajoutée à la playlist avec succès",
      data: playlist.videos
    });
  } catch (error) {
    console.error("Erreur addVideoToPlaylist:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout de la vidéo",
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer une vidéo d'une playlist
 * @route   DELETE /api/admin/playlists/:id/videos/:videoId
 * @access  Admin
 */
exports.removeVideoFromPlaylist = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier si la vidéo est dans la playlist
    const videoExists = playlist.videos.some(v => v.video_id.toString() === videoId);
    
    if (!videoExists) {
      return res.status(400).json({
        success: false,
        message: "Cette vidéo n'est pas dans la playlist"
      });
    }
    
    // Supprimer la vidéo
    await playlist.supprimerVideo(videoId);
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "SUPPRESSION_VIDEO_PLAYLIST",
      description_action: `Vidéo (${videoId}) supprimée de la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
      id_user: req.user.id,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        video_id: videoId,
        proprietaire_id: playlist.proprietaire
      },
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Vidéo supprimée de la playlist avec succès",
      data: playlist.videos
    });
  } catch (error) {
    console.error("Erreur removeVideoFromPlaylist:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la vidéo",
      error: error.message
    });
  }
};

/**
 * @desc    Réorganiser les vidéos d'une playlist
 * @route   PUT /api/admin/playlists/:id/reorder
 * @access  Admin
 */
exports.reorderPlaylistVideos = async (req, res) => {
  try {
    const { nouveauOrdre } = req.body;
    
    if (!nouveauOrdre || !Array.isArray(nouveauOrdre)) {
      return res.status(400).json({
        success: false,
        message: "Le nouvel ordre des vidéos est requis et doit être un tableau"
      });
    }
    
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier que tous les IDs sont valides
    const videoIds = playlist.videos.map(v => v.video_id.toString());
    const requestedIds = nouveauOrdre.map(item => item.videoId);
    
    const allIdsValid = requestedIds.every(id => videoIds.includes(id));
    
    if (!allIdsValid) {
      return res.status(400).json({
        success: false,
        message: "Certains IDs de vidéos ne sont pas valides pour cette playlist"
      });
    }
    
    // Réorganiser les vidéos
    await playlist.reorganiserVideos(nouveauOrdre);
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "REORDONNANCEMENT_PLAYLIST",
      description_action: `Ordre des vidéos modifié dans la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
      id_user: req.user.id,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        proprietaire_id: playlist.proprietaire
      },
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Ordre des vidéos mis à jour avec succès",
      data: playlist.videos
    });
  } catch (error) {
    console.error("Erreur reorderPlaylistVideos:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la réorganisation des vidéos",
      error: error.message
    });
  }
};

/**
 * @desc    Gérer les collaborateurs d'une playlist
 * @route   PUT /api/admin/playlists/:id/collaborateurs
 * @access  Admin
 */
exports.manageCollaborators = async (req, res) => {
  try {
    const { action, userId, permission } = req.body;
    
    if (!action || !userId) {
      return res.status(400).json({
        success: false,
        message: "Action et ID utilisateur requis"
      });
    }
    
    const playlist = await Playlist.findById(req.params.id);
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier si l'utilisateur existe
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    if (action === 'add') {
      // Vérifier que l'utilisateur n'est pas déjà collaborateur
      const isCollaborator = playlist.collaborateurs.some(c => 
        c.utilisateur && c.utilisateur.toString() === userId
      );
      
      if (isCollaborator) {
        return res.status(400).json({
          success: false,
          message: "Cet utilisateur est déjà collaborateur"
        });
      }
      
      // Ajouter le collaborateur
      playlist.collaborateurs.push({
        utilisateur: userId,
        permissions: permission || 'LECTURE',
        date_ajout: Date.now()
      });
      
      await playlist.save();
      
      // Journaliser l'action
      await LogAction.create({
        type_action: "AJOUT_COLLABORATEUR_PLAYLIST",
        description_action: `Collaborateur ${user.prenom} ${user.nom} (${userId}) ajouté à la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
        id_user: req.user.id,
        donnees_supplementaires: {
          playlist_id: playlist._id,
          collaborateur_id: userId,
          proprietaire_id: playlist.proprietaire,
          permission: permission || 'LECTURE'
        },
        created_by: req.user.id
      });
      
      res.status(200).json({
        success: true,
        message: "Collaborateur ajouté avec succès",
        data: playlist.collaborateurs
      });
    } 
    else if (action === 'remove') {
      // Vérifier que l'utilisateur est collaborateur
      const collaboratorIndex = playlist.collaborateurs.findIndex(c => 
        c.utilisateur && c.utilisateur.toString() === userId
      );
      
      if (collaboratorIndex === -1) {
        return res.status(400).json({
          success: false,
          message: "Cet utilisateur n'est pas collaborateur"
        });
      }
      
      // Supprimer le collaborateur
      playlist.collaborateurs.splice(collaboratorIndex, 1);
      await playlist.save();
      
      // Journaliser l'action
      await LogAction.create({
        type_action: "SUPPRESSION_COLLABORATEUR_PLAYLIST",
        description_action: `Collaborateur ${user.prenom} ${user.nom} (${userId}) supprimé de la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
        id_user: req.user.id,
        donnees_supplementaires: {
          playlist_id: playlist._id,
          collaborateur_id: userId,
          proprietaire_id: playlist.proprietaire
        },
        created_by: req.user.id
      });
      
      res.status(200).json({
        success: true,
        message: "Collaborateur supprimé avec succès",
        data: playlist.collaborateurs
      });
    } 
    else if (action === 'update') {
      if (!permission) {
        return res.status(400).json({
          success: false,
          message: "Permission requise pour la mise à jour"
        });
      }
      
      // Vérifier que l'utilisateur est collaborateur
      const collaboratorIndex = playlist.collaborateurs.findIndex(c => 
        c.utilisateur && c.utilisateur.toString() === userId
      );
      
      if (collaboratorIndex === -1) {
        return res.status(400).json({
          success: false,
          message: "Cet utilisateur n'est pas collaborateur"
        });
      }
      
      // Mettre à jour la permission
      playlist.collaborateurs[collaboratorIndex].permissions = permission;
      await playlist.save();
      
      // Journaliser l'action
      await LogAction.create({
        type_action: "MODIFICATION_PERMISSION_COLLABORATEUR",
        description_action: `Permission du collaborateur ${user.prenom} ${user.nom} (${userId}) modifiée dans la playlist "${playlist.nom}" (${playlist._id}) par un administrateur`,
        id_user: req.user.id,
        donnees_supplementaires: {
          playlist_id: playlist._id,
          collaborateur_id: userId,
          proprietaire_id: playlist.proprietaire,
          nouvelle_permission: permission
        },
        created_by: req.user.id
      });
      
      res.status(200).json({
        success: true,
        message: "Permission du collaborateur mise à jour avec succès",
        data: playlist.collaborateurs
      });
    } 
    else {
      return res.status(400).json({
        success: false,
        message: "Action non reconnue. Utilisez 'add', 'remove' ou 'update'"
      });
    }
  } catch (error) {
    console.error("Erreur manageCollaborators:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la gestion des collaborateurs",
      error: error.message
    });
  }
};