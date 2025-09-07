// controllers/adminController.js
const User = require("../models/User");
const LogAction = require("../models/LogAction");
const LoginAttempt = require("../models/LoginAttempt");
const StatutUser = require("../models/StatutUser");


// Version corrigée de dashboardStats
exports.dashboardStats = async (req, res) => {
  console.log("=== DÉBUT dashboardStats ===");
  
  try {
    // Données par défaut (fallbacks)
    const defaultStats = {
      basicStats: {
        userCount: 0,
        videoCount: 0,
        commentCount: 0,
        playlistCount: 0,
        podcastCount: 0,
        liveStreamCount: 0,
        memoryCount: 0
      },
      recentUsers: [],
      recentActivities: [],
      dailyStats: [],
      contentDistribution: {
        videos: 0,
        shorts: 0,
        music: 0,
        podcasts: 0,
        liveStreams: 0
      },
      topVideos: [],
      decadeStats: [],
      userStatusStats: [],
      likesActivity: [],
      actionTypesDistribution: []
    };
    
    // Modèles sûrs (vérifions qu'ils existent)
    let User, LogAction, Video, Comment, Like, Playlist, Podcast, LiveStream, Memory;
    
    // Importation sécurisée des modèles avec vérification
    try {
      User = require("../models/User");
      console.log(" Modèle User importé avec succès");
    } catch (err) {
      console.error(" Erreur lors de l'importation du modèle User:", err.message);
      return res.json({
        success: false,
        message: "Erreur: Modèle User introuvable",
        error: err.message,
        ...defaultStats
      });
    }
    
    try {
      LogAction = require("../models/LogAction");
      console.log(" Modèle LogAction importé avec succès");
    } catch (err) {
      console.error(" Erreur lors de l'importation du modèle LogAction:", err.message);
    }
    
    // Récupération des statistiques de base
    let userCount = 0;
    try {
      userCount = await User.countDocuments();
      console.log(` Nombre d'utilisateurs: ${userCount}`);
    } catch (err) {
      console.error(" Erreur lors du comptage des utilisateurs:", err.message);
    }
    
    // Récupération des utilisateurs récents
    let recentUsers = [];
    try {
      recentUsers = await User.find()
        .sort({ date_inscription: -1 })
        .limit(5)
        .select('nom prenom email statut_compte date_inscription');
      console.log(` ${recentUsers.length} utilisateurs récents récupérés`);
    } catch (err) {
      console.error(" Erreur lors de la récupération des utilisateurs récents:", err.message);
    }
    
    // Récupération des activités récentes
    let recentActivities = [];
    try {
      if (LogAction) {
        recentActivities = await LogAction.find()
          .sort({ date_action: -1 })
          .limit(5)
          .populate('id_user', 'nom prenom');
        console.log(` ${recentActivities.length} activités récentes récupérées`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération des activités récentes:", err.message);
    }
    
    // Statistiques d'activité par jour (7 derniers jours)
    let dailyStats = [];
    try {
      if (LogAction) {
        const lastWeekDate = new Date();
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        
        dailyStats = await LogAction.aggregate([
          { $match: { date_action: { $gte: lastWeekDate } } },
          { 
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date_action" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        console.log(` ${dailyStats.length} jours d'activités récupérés`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération des statistiques d'activité:", err.message);
    }
    
    // Essayer d'importer les autres modèles de manière sécurisée
    let videoCount = 0, commentCount = 0, playlistCount = 0, podcastCount = 0, 
        liveStreamCount = 0, memoryCount = 0;
    
    // Vidéos
    try {
      Video = require('../models/Video');
      console.log(" Modèle Video importé avec succès");
      
      videoCount = await Video.countDocuments();
      console.log(` Nombre de vidéos: ${videoCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des vidéos:", err.message);
    }
    
    // Commentaires
    try {
      Comment = require('../models/Comment');
      console.log(" Modèle Comment importé avec succès");
      
      commentCount = await Comment.countDocuments();
      console.log(` Nombre de commentaires: ${commentCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des commentaires:", err.message);
    }
    
    // Playlists
    try {
      Playlist = require('../models/Playlist');
      console.log(" Modèle Playlist importé avec succès");
      
      playlistCount = await Playlist.countDocuments();
      console.log(` Nombre de playlists: ${playlistCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des playlists:", err.message);
    }
    
    // Podcasts
    try {
      Podcast = require('../models/Podcast');
      console.log(" Modèle Podcast importé avec succès");
      
      podcastCount = await Podcast.countDocuments();
      console.log(` Nombre de podcasts: ${podcastCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des podcasts:", err.message);
    }
    
    // LiveStreams
    try {
      LiveStream = require('../models/LiveStream');
      console.log(" Modèle LiveStream importé avec succès");
      
      liveStreamCount = await LiveStream.countDocuments();
      console.log(` Nombre de livestreams: ${liveStreamCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des livestreams:", err.message);
    }
    
    // Mémoires
    try {
      Memory = require('../models/Memory');
      console.log(" Modèle Memory importé avec succès");
      
      memoryCount = await Memory.countDocuments();
      console.log(` Nombre de mémoires: ${memoryCount}`);
    } catch (err) {
      console.error(" Erreur lors de l'importation ou du comptage des mémoires:", err.message);
    }
    
    // Répartition des types de contenu
    let contentDistribution = {
      videos: videoCount,
      shorts: 0,
      music: 0,
      podcasts: podcastCount,
      liveStreams: liveStreamCount
    };
    
    try {
      if (Video) {
        contentDistribution.shorts = await Video.countDocuments({ type: 'short' });
        contentDistribution.music = await Video.countDocuments({ type: 'music' });
        console.log(` Répartition du contenu récupérée: ${JSON.stringify(contentDistribution)}`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération de la répartition du contenu:", err.message);
    }
    
    // Top 5 des vidéos les plus vues
    let topVideos = [];
    try {
      if (Video) {
        topVideos = await Video.find()
          .sort({ vues: -1 })
          .limit(5)
          .select('titre artiste vues likes type');
        console.log(` ${topVideos.length} vidéos populaires récupérées`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération des vidéos populaires:", err.message);
    }
    
    // Statistiques par décennie pour les vidéos musicales
    let decadeStats = [];
    try {
      if (Video) {
        decadeStats = await Video.aggregate([
          { $match: { type: 'music', decennie: { $exists: true } } },
          { $group: { _id: "$decennie", count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);
        console.log(` ${decadeStats.length} statistiques par décennie récupérées`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération des statistiques par décennie:", err.message);
    }
    
    // Statistiques des utilisateurs par statut
    let userStatusStats = [];
    try {
      userStatusStats = await User.aggregate([
        { $group: { _id: "$statut_compte", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      console.log(` ${userStatusStats.length} statistiques par statut utilisateur récupérées`);
    } catch (err) {
      console.error(" Erreur lors de la récupération des statistiques par statut utilisateur:", err.message);
    }
    
    // Activité de likes par jour (7 derniers jours)
    let likesActivity = [];
    try {
      if (Like) {
        const lastWeekDate = new Date();
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        
        likesActivity = await Like.aggregate([
          { $match: { creation_date: { $gte: lastWeekDate } } },
          { 
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$creation_date" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        console.log(` ${likesActivity.length} jours d'activité de likes récupérés`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération de l'activité de likes:", err.message);
    }
    
    // Distribution des types d'actions dans les logs
    let actionTypesDistribution = [];
    try {
      if (LogAction) {
        actionTypesDistribution = await LogAction.aggregate([
          { $group: { _id: "$type_action", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]);
        console.log(` ${actionTypesDistribution.length} types d'actions récupérés`);
      }
    } catch (err) {
      console.error(" Erreur lors de la récupération de la distribution des types d'actions:", err.message);
    }
    
    console.log(" Envoi de la réponse JSON...");
    
    res.json({
      success: true,
      basicStats: {
        userCount,
        videoCount,
        commentCount,
        playlistCount,
        podcastCount,
        liveStreamCount,
        memoryCount
      },
      recentUsers,
      recentActivities,
      dailyStats,
      contentDistribution,
      topVideos,
      decadeStats,
      userStatusStats,
      likesActivity,
      actionTypesDistribution
    });
    
    console.log("=== FIN dashboardStats: SUCCÈS ===");
  } catch (error) {
    console.error("=== FIN dashboardStats: ERREUR ===", error);
    res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors du chargement des statistiques du dashboard.",
      error: error.message
    });
  }
};



// API: Récupérer la liste des utilisateurs
exports.getUsersAPI = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filtres
    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { nom: { $regex: req.query.search, $options: 'i' } },
        { prenom: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.status) {
      filter.statut_compte = req.query.status;
    }
    
    if (req.query.role) {
      filter.role = req.query.role;
    }
    
    // Comptage total pour pagination
    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Récupération des utilisateurs
    const users = await User.find(filter)
      .sort({ date_inscription: -1 })
      .skip(skip)
      .limit(limit)
      .select('-mot_de_passe');
    
    res.json({
      success: true,
      users,
      currentPage: page,
      totalPages,
      total
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la récupération des utilisateurs."
    });
  }
};

// API: Récupérer les détails d'un utilisateur
exports.getUserDetailsAPI = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-mot_de_passe');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Utilisateur non trouvé" 
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des détails utilisateur:", error);
    res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la récupération des détails utilisateur."
    });
  }
};

// Nouvelle version RESTful de updateUser (API)
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }

    // Vérifier si l'email existe déjà pour un autre utilisateur
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Cet email est déjà utilisé par un autre utilisateur." });
      }
    }

    // Mise à jour partielle des champs
    const updatableFields = [
      'nom', 'prenom', 'email', 'role', 'statut_compte', 'bio',
      'genre', 'pays', 'ville', 'adresse', 'code_postal', 'photo_profil', 'photo_couverture',
      'profession', 'telephone', 'compte_prive', 'statut_verification', 'preferences_confidentialite', 'preferences_notification'
    ];
    
    // Track changes for logging
    const changes = {};
    
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Store old value for logging
        if (user[field] !== req.body[field]) {
          changes[field] = {
            from: user[field],
            to: req.body[field]
          };
        }
        user[field] = req.body[field];
      }
    });

    // Mot de passe
    if (req.body.password && req.body.password.trim() !== '') {
      const bcrypt = require('bcrypt');
      user.mot_de_passe = await bcrypt.hash(req.body.password, 10);
      changes['password'] = { from: '********', to: '********' };
    }

    user.modified_date = Date.now();
    user.modified_by = req.user?.id;
    await user.save();

    // Log the action if there were changes
    if (Object.keys(changes).length > 0) {
      await LogAction.create({
        type_action: "MODIFICATION_UTILISATEUR",
        description_action: `Modification de l'utilisateur ${user.prenom} ${user.nom} (${user.email})`,
        id_user: userId,
        created_by: req.user?.id,
        donnees_supplementaires: { changes }
      });
    }

    return res.json({ success: true, message: "Utilisateur modifié avec succès", user });
  } catch (error) {
    console.error("Erreur updateUser:", error);
    return res.status(500).json({ success: false, message: "Une erreur est survenue lors de la modification de l'utilisateur.", error: error.message });
  }
};

// La fonction updateUserStats

exports.updateUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newStatus } = req.body;
    
    console.log(`Modification du statut pour l'utilisateur ${userId} en ${newStatus}`);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }
    
    // Vérifier si le statut est valide
    const validStatut = await StatutUser.findOne({ code_statut: newStatus });
    if (!validStatut) {
      return res.status(400).json({ success: false, message: "Statut invalide" });
    }
    
    const oldStatus = user.statut_compte;
    
    // Mettre à jour le statut
    user.statut_compte = newStatus;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "MODIFICATION_STATUT",
      description_action: `Statut modifié de ${oldStatus} à ${newStatus}`,
      id_user: userId,
      created_by: req.user.id
    });
    
    // Si le statut est maintenant VERROUILLE ou SUPPRIME, on réinitialise les tentatives de connexion
    if (newStatus === "VERROUILLE" || newStatus === "SUPPRIME") {
      // Vérifier d'abord le schéma pour déterminer le nom correct du champ
      const loginAttemptModel = LoginAttempt.schema.obj;
      console.log("Schéma LoginAttempt:", Object.keys(loginAttemptModel));

      // Déterminer le nom correct du champ qui lie à l'utilisateur
      let userIdField = 'id_user'; // Valeur par défaut à utiliser
      
      // Rechercher dans le schéma pour le bon nom de champ
      if (loginAttemptModel.hasOwnProperty('id_utilisateur')) {
        userIdField = 'id_utilisateur';
      } else if (loginAttemptModel.hasOwnProperty('userId')) {
        userIdField = 'userId';
      } else if (loginAttemptModel.hasOwnProperty('user_id')) {
        userIdField = 'user_id';
      }
      
      console.log(`Utilisation du champ ${userIdField} pour la mise à jour des tentatives de connexion`);
      
      // Créer un objet de requête dynamique avec le bon nom de champ
      const query = {};
      query[userIdField] = userId;
      
      await LoginAttempt.findOneAndUpdate(
        query,
        { 
          compte_verrouille: 'Y',
          modified_date: Date.now(),
          modified_by: req.user.id
        },
        { upsert: true }
      );
    }
    
    return res.json({ 
      success: true, 
      message: "Statut mis à jour avec succès",
      newStatus,
      statusLabel: validStatut.libelle_statut || getStatusText(newStatus),
      statusColor: validStatut.couleur || getStatusColor(newStatus)
    });
  } catch (error) {
    console.error("Erreur lors de la modification du statut:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la modification du statut.",
      error: error.message
    });
  }
};
// Réinitialiser les tentatives de connexion
exports.resetLoginAttempts = async (req, res) => {
  try {
    const userId = req.params.id;
    
    const loginAttempt = await LoginAttempt.findOne({ id_utilisateur: userId });
    if (loginAttempt) {
      loginAttempt.nb_tentatives = 0;
      loginAttempt.compte_verrouille = 'N';
      loginAttempt.modified_date = Date.now();
      loginAttempt.modified_by = req.user.id;
      await loginAttempt.save();
      
      // Journaliser l'action
      await LogAction.create({
        type_action: "RESET_TENTATIVES",
        description_action: "Réinitialisation des tentatives de connexion",
        id_user: userId,
        created_by: req.user.id
      });
      
      // Si l'utilisateur était verrouillé pour tentatives, le réactiver
      const user = await User.findById(userId);
      if (user && user.statut_compte === "VERROUILLE") {
        user.statut_compte = "ACTIF";
        await user.save();
      }
    }
    
    return res.json({ success: true, message: "Tentatives réinitialisées avec succès" });
  } catch (error) {
    console.error("Erreur lors de la réinitialisation des tentatives:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la réinitialisation."
    });
  }
};

// Supprimer un utilisateur (hard delete)
exports.deleteUser = async (req, res) => {
  try {
    console.log("Tentative de suppression d'utilisateur");
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Utilisateur non trouvé" 
      });
    }

    // Vérifier si l'utilisateur n'essaie pas de se supprimer lui-même
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez pas supprimer votre propre compte"
      });
    }

    // Suppression réelle
    await User.deleteOne({ _id: userId });
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "SUPPRESSION_UTILISATEUR",
      description_action: `Suppression de l'utilisateur ${user.prenom} ${user.nom} (${user.email})`,
      created_by: req.user.id
    });

    return res.json({ 
      success: true, 
      message: "Utilisateur supprimé avec succès" 
    });
  } catch (error) {
    console.error("Erreur détaillée lors de la suppression:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la suppression.",
      error: error.message 
    });
  }
};

// API: Récupérer les logs d'activité d'un utilisateur
exports.getUserLogsAPI = async (req, res) => {
  try {
    const userId = req.query.userId;
    const limit = parseInt(req.query.limit) || 20;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "L'ID de l'utilisateur est requis"
      });
    }
    
    const logs = await LogAction.find({ id_user: userId })
      .sort({ date_action: -1 })
      .limit(limit);
    
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des logs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la récupération des logs d'activité."
    });
  }
};

// API: Récupérer les tentatives de connexion d'un utilisateur
exports.getLoginAttemptsAPI = async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "L'ID de l'utilisateur est requis"
      });
    }
    
    const attempts = await LoginAttempt.findOne({ id_utilisateur: userId });
    
    res.json({
      success: true,
      attempts
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des tentatives de connexion:", error);
    res.status(500).json({ 
      success: false, 
      message: "Une erreur est survenue lors de la récupération des tentatives de connexion."
    });
  }
};

// API: Bulk status change
exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { userIds, newStatus } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "User IDs array is required" 
      });
    }
    
    if (!newStatus) {
      return res.status(400).json({ 
        success: false, 
        message: "New status is required" 
      });
    }
    
    // Verify status is valid
    const validStatut = await StatutUser.findOne({ code_statut: newStatus });
    if (!validStatut) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid status" 
      });
    }
    
    // Update users
    const updateResult = await User.updateMany(
      { _id: { $in: userIds } },
      { 
        $set: { 
          statut_compte: newStatus,
          modified_date: Date.now(),
          modified_by: req.user.id
        }
      }
    );
    
    // Log actions for each user
    for (const userId of userIds) {
      await LogAction.create({
        type_action: "MODIFICATION_STATUT_MASSE",
        description_action: `Statut modifié en ${newStatus} (opération groupée)`,
        id_user: userId,
        created_by: req.user.id
      });
    }
    
    res.json({
      success: true,
      message: `Status updated for ${updateResult.modifiedCount} users`,
      updatedCount: updateResult.modifiedCount
    });
  } catch (error) {
    console.error("Error during bulk status update:", error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during bulk status update." 
    });
  }
};

// API: Bulk delete users
exports.bulkDeleteUsers = async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "User IDs array is required" 
      });
    }
    
    // Prevent self-deletion
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account"
      });
    }
    
    // Delete users
    const deleteResult = await User.deleteMany({ _id: { $in: userIds } });
    
    res.json({
      success: true,
      message: `${deleteResult.deletedCount} users deleted successfully`,
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    console.error("Error during bulk user deletion:", error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during bulk user deletion." 
    });
  }
};

// Mettre à jour le rôle de l'utilisateur admin
exports.updateAdminRole = async (req, res) => {
  try {
    const adminEmail = 'admin@throwback.com';
    const user = await User.findOne({ email: adminEmail });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur admin non trouvé" });
    }

    user.role = 'admin';
    await user.save();

    return res.json({ success: true, message: "Rôle admin mis à jour avec succès" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du rôle admin:", error);
    return res.status(500).json({ success: false, message: "Une erreur est survenue lors de la mise à jour du rôle." });
  }
};

// Fonctions utilitaires pour les statuts
function getStatusText(status) {
  switch (status) {
    case 'ACTIF': return 'Active';
    case 'VERROUILLE': return 'Locked';
    case 'INACTIF': return 'Inactive';
    case 'SUSPENDU': return 'Suspended';
    case 'SUPPRIME': return 'Deleted';
    default: return 'Unknown';
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'ACTIF': return 'green';
    case 'VERROUILLE': return 'orange';
    case 'INACTIF': return 'gray';
    case 'SUSPENDU': return 'red';
    case 'SUPPRIME': return 'black';
    default: return 'gray';
  }
}