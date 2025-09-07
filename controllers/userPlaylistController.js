// controllers/userPlaylistController.js - Version corrigée
const Playlist = require('../models/Playlist');
const Video = require('../models/Video');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Créer une nouvelle playlist
 * @route   POST /api/playlists
 * @access  Private
 */
exports.createPlaylist = async (req, res) => {
  try {
    console.log("createPlaylist - Données reçues:", req.body);
    const { nom, description, videos = [], visibilite = 'PUBLIC', image_couverture } = req.body;
    const userId = req.user._id || req.user.id;

    // Validation de base
    if (!nom) {
      return res.status(400).json({
        success: false,
        message: "Le nom de la playlist est requis"
      });
    }

    // Créer la playlist
    const playlist = new Playlist({
      nom,
      description,
      proprietaire: userId,
      visibilite,
      image_couverture,
      created_by: userId
    });

    // Ajouter les vidéos si présentes
    if (videos && videos.length > 0) {
      console.log("Ajout des vidéos à la playlist:", videos);
      
      // Récupérer les IDs des vidéos (plusieurs formats possibles)
      const videoIds = videos.map(v => {
        if (typeof v === 'object' && v !== null) {
          return v.videoId || v._id;
        }
        return v;
      });
      
      console.log("IDs des vidéos extraits:", videoIds);
      
      // Vérifier que toutes les vidéos existent
      const existingVideos = await Video.find({ _id: { $in: videoIds } });
      console.log(`Vidéos trouvées: ${existingVideos.length}/${videoIds.length}`);
      
      if (existingVideos.length !== videoIds.length) {
        console.warn("Certaines vidéos n'ont pas été trouvées");
        // On continue quand même avec les vidéos trouvées
      }

      // Ajouter les vidéos à la playlist avec leur ordre
      existingVideos.forEach((video, index) => {
        // Trouver l'ordre spécifié ou utiliser l'index
        const videoItem = videos.find(v => {
          if (typeof v === 'object' && v !== null) {
            const videoId = v.videoId || v._id;
            return videoId && videoId.toString() === video._id.toString();
          }
          return v && v.toString() === video._id.toString();
        });
        
        const ordre = (videoItem && typeof videoItem === 'object' && videoItem.ordre) 
                    ? videoItem.ordre 
                    : index + 1;
        
        playlist.videos.push({
          video_id: video._id,
          ordre: ordre,
          date_ajout: new Date(),
          ajoute_par: userId
        });
      });

      // Mettre à jour les métadonnées des vidéos pour référencer cette playlist
      try {
        await Video.updateMany(
          { _id: { $in: existingVideos.map(v => v._id) } },
          { $addToSet: { 'meta.playlists': playlist._id } }
        );
        console.log("Métadonnées des vidéos mises à jour");
      } catch (metaErr) {
        console.error("Erreur lors de la mise à jour des métadonnées des vidéos:", metaErr);
        // Continue sans bloquer
      }
    }

    await playlist.save();
    console.log("Playlist créée avec succès:", playlist._id);

    // Journal d'action
    try {
      await LogAction.create({
        type_action: "PLAYLIST_CREEE",
        description_action: `Playlist "${nom}" créée`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          playlist_id: playlist._id,
          playlist_nom: nom
        }
      });
    } catch (logErr) {
      console.error("Erreur lors de la journalisation:", logErr);
      // Continue sans bloquer
    }

    res.status(201).json({
      success: true,
      message: "Playlist créée avec succès",
      data: playlist
    });
  } catch (err) {
    console.error("Erreur lors de la création de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la création de la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Récupérer toutes les playlists de l'utilisateur
 * @route   GET /api/playlists/user
 * @access  Private
 */
exports.getUserPlaylists = async (req, res) => {
  try {
    console.log("getUserPlaylists - Utilisateur:", req.user.id || req.user._id);
    const userId = req.user._id || req.user.id;

    const playlists = await Playlist.find({ proprietaire: userId })
      .sort({ creation_date: -1 })
      .select('nom description visibilite videos nb_lectures nb_favoris image_couverture creation_date')
      .populate({
        path: 'videos.video_id',
        select: 'titre artiste thumbnail duree'
      });

    console.log(`${playlists.length} playlists trouvées`);

    // Compter le nombre de vidéos pour chaque playlist
    const playlistsWithCounts = playlists.map(playlist => {
      const playlistObj = playlist.toObject();
      playlistObj.nb_videos = playlist.videos ? playlist.videos.length : 0;
      // Vérifier si l'utilisateur a mis la playlist en favori
      playlistObj.isFavorite = playlist.favori_par && 
                               playlist.favori_par.some(id => id.toString() === userId.toString());
      return playlistObj;
    });

    res.status(200).json({
      success: true,
      data: playlistsWithCounts
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des playlists:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des playlists",
      error: err.message
    });
  }
};

/**
 * @desc    Récupérer les détails d'une playlist
 * @route   GET /api/playlists/:id
 * @access  Private/Public (selon la visibilité)
 */
exports.getPlaylistById = async (req, res) => {
  try {
    console.log("getPlaylistById - ID:", req.params.id);
    const { id } = req.params;
    const userId = req.user ? (req.user._id || req.user.id) : null;

    const playlist = await Playlist.findById(id)
      .populate({
        path: 'videos.video_id',
        select: 'titre artiste type youtubeUrl annee vues likes thumbnail duree'
      })
      .populate('proprietaire', 'nom prenom photo_profil');

    if (!playlist) {
      console.log("Playlist non trouvée");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }

    console.log("Playlist trouvée:", playlist._id);

    // Vérifier les permissions d'accès
    if (playlist.visibilite === 'PRIVE' && 
        (!userId || 
         (playlist.proprietaire._id.toString() !== userId.toString() && 
          playlist.proprietaire.toString() !== userId.toString()))) {
      console.log("Accès refusé (playlist privée)");
      return res.status(403).json({
        success: false,
        message: "Vous n'avez pas l'autorisation d'accéder à cette playlist"
      });
    }

    if (playlist.visibilite === 'AMIS') {
      // TODO: Vérifier si l'utilisateur est ami avec le propriétaire
      // Pour l'instant, seul le propriétaire peut voir
      const ownerId = playlist.proprietaire._id || playlist.proprietaire;
      if (!userId || (ownerId.toString() !== userId.toString())) {
        console.log("Accès refusé (playlist amis uniquement)");
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas l'autorisation d'accéder à cette playlist"
        });
      }
    }

    // Incrémenter le compteur de lectures
    if (userId && playlist.proprietaire && 
        playlist.proprietaire._id && 
        playlist.proprietaire._id.toString() !== userId.toString()) {
      playlist.nb_lectures += 1;
      await playlist.save();
      console.log("Compteur de lectures incrémenté");
    }

    // Vérifier si l'utilisateur a mis la playlist en favori
    let isFavorite = false;
    if (userId) {
      isFavorite = playlist.favori_par && 
                  playlist.favori_par.some(id => id.toString() === userId.toString());
    }

    // Trier les vidéos par ordre
    if (playlist.videos) {
      playlist.videos.sort((a, b) => a.ordre - b.ordre);
    }

    // Vérifier et compléter les URLs des vidéos
    if (playlist.videos && playlist.videos.length > 0) {
      playlist.videos.forEach(videoItem => {
        if (videoItem.video_id && videoItem.video_id.youtubeUrl) {
          // Si l'URL n'est pas complète, ajouter le domaine de base
          if (!videoItem.video_id.youtubeUrl.startsWith('http') && 
              !videoItem.video_id.youtubeUrl.startsWith('/')) {
            videoItem.video_id.youtubeUrl = '/' + videoItem.video_id.youtubeUrl;
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...playlist.toObject(),
        isFavorite
      }
    });
  } catch (err) {
    console.error("Erreur lors de la récupération de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération de la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Ajouter une vidéo à une playlist
 * @route   POST /api/playlists/:id/videos
 * @access  Private
 */
exports.addVideoToPlaylist = async (req, res) => {
  try {
    console.log("addVideoToPlaylist - Playlist:", req.params.id, "Vidéo:", req.body.videoId);
    const { id: playlistId } = req.params;
    const { videoId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "L'ID de la vidéo est requis"
      });
    }

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['AJOUT', 'MODIFICATION'] } }
      ]
    });

    if (!playlist) {
      console.log("Playlist non trouvée ou permissions insuffisantes");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Vérifier que la vidéo existe
    const video = await Video.findById(videoId);
    if (!video) {
      console.log("Vidéo non trouvée");
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée"
      });
    }

    // Vérifier si la vidéo est déjà dans la playlist
    const videoExists = playlist.videos.some(v => v.video_id.equals(videoId));
    if (videoExists) {
      console.log("Vidéo déjà dans la playlist");
      return res.status(400).json({
        success: false,
        message: "Cette vidéo est déjà dans la playlist"
      });
    }

    // Ajouter la vidéo à la playlist
    const ordre = playlist.videos.length + 1;
    playlist.videos.push({
      video_id: videoId,
      ordre,
      date_ajout: Date.now(),
      ajoute_par: userId
    });

    // Mettre à jour les métadonnées de la vidéo
    try {
      await Video.findByIdAndUpdate(videoId, {
        $addToSet: { 'meta.playlists': playlistId }
      });
      console.log("Métadonnées de la vidéo mises à jour");
    } catch (metaErr) {
      console.error("Erreur lors de la mise à jour des métadonnées de la vidéo:", metaErr);
      // Continue sans bloquer
    }

    // Sauvegarder les modifications
    await playlist.save();
    console.log("Vidéo ajoutée à la playlist avec succès");

    // Journal d'action
    try {
      await LogAction.create({
        type_action: "VIDEO_AJOUTEE_PLAYLIST",
        description_action: `Vidéo ajoutée à la playlist "${playlist.nom}"`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          playlist_id: playlistId,
          playlist_nom: playlist.nom,
          video_id: videoId,
          video_titre: video.titre
        }
      });
    } catch (logErr) {
      console.error("Erreur lors de la journalisation:", logErr);
      // Continue sans bloquer
    }

    res.status(200).json({
      success: true,
      message: "Vidéo ajoutée à la playlist avec succès",
      data: {
        playlistId,
        videoId,
        ordre
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout de la vidéo à la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout de la vidéo à la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Supprimer une vidéo d'une playlist
 * @route   DELETE /api/playlists/:id/videos/:videoId
 * @access  Private
 */
exports.removeVideoFromPlaylist = async (req, res) => {
  try {
    console.log("removeVideoFromPlaylist - Playlist:", req.params.id, "Vidéo:", req.params.videoId);
    const { id: playlistId, videoId } = req.params;
    const userId = req.user._id || req.user.id;

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['MODIFICATION'] } }
      ]
    });

    if (!playlist) {
      console.log("Playlist non trouvée ou permissions insuffisantes");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Vérifier que la vidéo est dans la playlist
    const videoIndex = playlist.videos.findIndex(v => v.video_id.equals(videoId));
    if (videoIndex === -1) {
      console.log("Vidéo non trouvée dans la playlist");
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée dans la playlist"
      });
    }

    // Supprimer la vidéo de la playlist
    playlist.videos.splice(videoIndex, 1);

    // Réorganiser les ordres
    playlist.videos.forEach((video, index) => {
      video.ordre = index + 1;
    });

    // Mettre à jour les métadonnées de la vidéo
    try {
      await Video.findByIdAndUpdate(videoId, {
        $pull: { 'meta.playlists': playlistId }
      });
      console.log("Métadonnées de la vidéo mises à jour");
    } catch (metaErr) {
      console.error("Erreur lors de la mise à jour des métadonnées de la vidéo:", metaErr);
      // Continue sans bloquer
    }

    // Sauvegarder les modifications
    await playlist.save();
    console.log("Vidéo supprimée de la playlist avec succès");

    // Journal d'action
    try {
      await LogAction.create({
        type_action: "VIDEO_SUPPRIMEE_PLAYLIST",
        description_action: `Vidéo supprimée de la playlist "${playlist.nom}"`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          playlist_id: playlistId,
          playlist_nom: playlist.nom,
          video_id: videoId
        }
      });
    } catch (logErr) {
      console.error("Erreur lors de la journalisation:", logErr);
      // Continue sans bloquer
    }

    res.status(200).json({
      success: true,
      message: "Vidéo supprimée de la playlist avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la suppression de la vidéo de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la vidéo de la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Mettre à jour une playlist
 * @route   PUT /api/playlists/:id
 * @access  Private
 */
exports.updatePlaylist = async (req, res) => {
  try {
    console.log("updatePlaylist - ID:", req.params.id);
    console.log("Données reçues:", req.body);
    
    const { id } = req.params;
    const { nom, description, visibilite, videos, image_couverture } = req.body;
    const userId = req.user._id || req.user.id;
    
    // Recherche de la playlist avec vérification souple du propriétaire
    const playlist = await Playlist.findById(id);
    
    if (!playlist) {
      console.log("Playlist non trouvée");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier que l'utilisateur est le propriétaire
    const ownerId = playlist.proprietaire._id || playlist.proprietaire;
    if (ownerId.toString() !== userId.toString()) {
      console.log("Utilisateur non autorisé à modifier cette playlist");
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à modifier cette playlist"
      });
    }
    
    // Mettre à jour les champs
    if (nom) playlist.nom = nom;
    if (description !== undefined) playlist.description = description;
    if (visibilite) playlist.visibilite = visibilite;
    if (image_couverture !== undefined) playlist.image_couverture = image_couverture;
    
    // Mettre à jour la liste des vidéos si fournie
    if (videos && Array.isArray(videos)) {
      console.log("Mise à jour des vidéos de la playlist:", videos);
      
      // Récupérer les IDs des vidéos (plusieurs formats possibles)
      const videoIds = videos.map(v => {
        if (typeof v === 'object' && v !== null) {
          return v.videoId || v._id;
        }
        return v;
      });
      
      console.log("IDs des vidéos extraits:", videoIds);
      
      // Vérifier que toutes les vidéos existent
      const existingVideos = await Video.find({ _id: { $in: videoIds } });
      console.log(`Vidéos trouvées: ${existingVideos.length}/${videoIds.length}`);
      
      // Effacer les vidéos actuelles
      playlist.videos = [];
      
      // Ajouter les nouvelles vidéos avec l'ordre
      existingVideos.forEach((video, index) => {
        // Trouver l'ordre spécifié ou utiliser l'index
        const videoItem = videos.find(v => {
          if (typeof v === 'object' && v !== null) {
            const videoId = v.videoId || v._id;
            return videoId && videoId.toString() === video._id.toString();
          }
          return v && v.toString() === video._id.toString();
        });
        
        const ordre = (videoItem && typeof videoItem === 'object' && videoItem.ordre) 
                    ? videoItem.ordre 
                    : index + 1;
        
        playlist.videos.push({
          video_id: video._id,
          ordre: ordre,
          date_ajout: new Date(),
          ajoute_par: userId
        });
      });
    }
    
    playlist.modified_date = Date.now();
    playlist.modified_by = userId;
    
    await playlist.save();
    console.log("Playlist mise à jour avec succès");
    
    // Journal d'action
    try {
      await LogAction.create({
        type_action: "PLAYLIST_MODIFIEE",
        description_action: `Playlist "${playlist.nom}" modifiée`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          playlist_id: id,
          playlist_nom: playlist.nom
        }
      });
    } catch (logErr) {
      console.error("Erreur lors de la journalisation:", logErr);
      // Continue sans bloquer
    }
    
    res.status(200).json({
      success: true,
      message: "Playlist mise à jour avec succès",
      data: playlist
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour de la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Réorganiser l'ordre des vidéos dans une playlist
 * @route   PUT /api/playlists/:id/reorder
 * @access  Private
 */
exports.reorderPlaylist = async (req, res) => {
  try {
    console.log("reorderPlaylist - ID:", req.params.id);
    console.log("Données reçues:", req.body);
    
    const { id: playlistId } = req.params;
    const { videoOrders } = req.body;
    const userId = req.user._id || req.user.id;
    
    if (!videoOrders || !Array.isArray(videoOrders)) {
      return res.status(400).json({
        success: false,
        message: "Format de données invalide pour la réorganisation"
      });
    }
    
    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['MODIFICATION'] } }
      ]
    });
    
    if (!playlist) {
      console.log("Playlist non trouvée ou permissions insuffisantes");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }
    
    // Mettre à jour l'ordre des vidéos
    videoOrders.forEach(item => {
      const video = playlist.videos.find(v => v.video_id.toString() === item.videoId);
      if (video) {
        video.ordre = item.ordre;
      }
    });
    
    playlist.modified_date = Date.now();
    playlist.modified_by = userId;
    
    await playlist.save();
    console.log("Ordre des vidéos mis à jour avec succès");
    
    res.status(200).json({
      success: true,
      message: "Ordre des vidéos mis à jour avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la réorganisation de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la réorganisation de la playlist",
      error: err.message
    });
  }
};

/**
 * @desc    Ajouter/supprimer une playlist aux favoris
 * @route   POST /api/playlists/:id/favorite
 * @access  Private
 */
exports.toggleFavorite = async (req, res) => {
  try {
    console.log("toggleFavorite - ID:", req.params.id);
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    
    // Vérifier que la playlist existe
    const playlist = await Playlist.findById(id);
    
    if (!playlist) {
      console.log("Playlist non trouvée");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Vérifier si la playlist est déjà en favori
    const isFavorite = playlist.favori_par && 
                        playlist.favori_par.some(favId => favId.toString() === userId.toString());
    
    if (isFavorite) {
      // Supprimer des favoris
      playlist.favori_par = playlist.favori_par.filter(favId => favId.toString() !== userId.toString());
      playlist.nb_favoris = Math.max(0, playlist.nb_favoris - 1);
      
      await playlist.save();
      console.log("Playlist retirée des favoris");
      
      return res.status(200).json({
        success: true,
        message: "Playlist retirée des favoris",
        isFavorite: false
      });
    } else {
      // Ajouter aux favoris
      if (!playlist.favori_par) {
        playlist.favori_par = [];
      }
      playlist.favori_par.push(userId);
      playlist.nb_favoris += 1;
      
      await playlist.save();
      console.log("Playlist ajoutée aux favoris");
      
      // Journal d'action
      try {
        await LogAction.create({
          type_action: "PLAYLIST_FAVORIS",
          description_action: `Playlist "${playlist.nom}" ajoutée aux favoris`,
          id_user: userId,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          created_by: userId,
          donnees_supplementaires: {
            playlist_id: id,
            playlist_nom: playlist.nom
          }
        });
      } catch (logErr) {
        console.error("Erreur lors de la journalisation:", logErr);
        // Continue sans bloquer
      }
      
      return res.status(200).json({
        success: true,
        message: "Playlist ajoutée aux favoris",
        isFavorite: true
      });
    }
  } catch (err) {
    console.error("Erreur lors de la gestion des favoris:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la gestion des favoris",
      error: err.message
    });
  }
};



// Liste publique "populaire"
exports.getPopularPlaylists = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const playlists = await Playlist.find({ visibilite: 'PUBLIC' })
      .sort({ nb_lectures: -1 })
      .limit(limit)
      .select('nom description image_couverture nb_lectures nb_favoris creation_date proprietaire');
    res.json({ success: true, data: playlists });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur listes populaires', error: err.message });
  }
};

// (facultatif mais utile si tes routes les appellent déjà)
exports.deletePlaylist = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const Playlist = require('../models/Playlist');

    const pl = await Playlist.findById(id);
    if (!pl) return res.status(404).json({ success: false, message: 'Playlist non trouvée' });

    const ownerId = pl.proprietaire?._id || pl.proprietaire;
    if (!ownerId || ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Non autorisé à supprimer cette playlist" });
    }

    await pl.deleteOne();
    res.json({ success: true, message: 'Playlist supprimée' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur suppression playlist', error: err.message });
  }
};

// (facultatif) stub de partage pour éviter undefined si déjà routé
exports.sharePlaylist = async (req, res) => {
  try {
    // Implémentation basique/no-op
    res.json({ success: true, message: 'Partage enregistré (placeholder)' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur partage playlist', error: err.message });
  }
};

/**
 * @desc    Incrémenter le nombre de vues d'une playlist
 * @route   POST /api/playlists/:id/view
 * @access  Public
 */
exports.incrementPlaylistViews = async (req, res) => {
  try {
    console.log("incrementPlaylistViews - ID:", req.params.id);
    const { id } = req.params;
    
    // Vérifier que la playlist existe
    const playlist = await Playlist.findById(id);
    
    if (!playlist) {
      console.log("Playlist non trouvée");
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }
    
    // Incrémenter le compteur de vues
    playlist.nb_lectures = (playlist.nb_lectures || 0) + 1;
    
    await playlist.save();
    console.log("Nombre de vues incrémenté:", playlist.nb_lectures);
    
    res.status(200).json({
      success: true,
      message: "Nombre de vues incrémenté avec succès",
      nb_lectures: playlist.nb_lectures
    });
  } catch (err) {
    console.error("Erreur lors de l'incrémentation des vues:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'incrémentation des vues",
      error: err.message
    });
  }
};

/**
 * @desc    Ajouter/supprimer un like à une playlist (alias de toggleFavorite)
 * @route   POST /api/playlists/:id/like
 * @access  Private
 */
exports.toggleLike = exports.toggleFavorite;