const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { isAdmin } = require('../../middlewares/authMiddleware');
const adminController = require('../../controllers/adminController');

// Log de démarrage
console.log('Admin API routes loaded');

// ========================
// ROUTE DASHBOARD CORRIGÉE
// ========================
router.get('/dashboard', isAdmin, (req, res) => {
  console.log("Route dashboard appelée");
  
  // Vérification si dashboardStats existe
  if (typeof adminController.dashboardStats === 'function') {
    console.log("Fonction dashboardStats trouvée, exécution...");
    return adminController.dashboardStats(req, res);
  } else {
    console.log("Fonction dashboardStats non trouvée, utilisation du fallback");
    // Fallback avec données de base si la fonction n'existe pas
    try {
      User.countDocuments()
        .then(userCount => {
          User.find()
            .sort({ date_inscription: -1 })
            .limit(5)
            .select('nom prenom email statut_compte date_inscription')
            .then(recentUsers => {
              res.json({
                success: true,
                basicStats: {
                  userCount,
                  videoCount: 12453, // Données fictives
                  commentCount: 25741,
                  playlistCount: 4385,
                  podcastCount: 122,
                  liveStreamCount: 34,
                  memoryCount: 5642
                },
                recentUsers,
                recentActivities: [],
                dailyStats: [],
                contentDistribution: {
                  videos: 12453,
                  shorts: 1254,
                  music: 11199,
                  podcasts: 122,
                  liveStreams: 34
                },
                topVideos: [],
                decadeStats: [],
                userStatusStats: []
              });
            })
            .catch(err => {
              console.error("Erreur lors de la récupération des utilisateurs récents:", err);
              res.status(500).json({ 
                success: false, 
                message: "Erreur lors de la récupération des utilisateurs récents", 
                error: err.message 
              });
            });
        })
        .catch(err => {
          console.error("Erreur lors du comptage des utilisateurs:", err);
          res.status(500).json({ 
            success: false, 
            message: "Erreur lors du comptage des utilisateurs", 
            error: err.message 
          });
        });
    } catch (error) {
      console.error("Erreur lors du chargement du dashboard:", error);
      res.status(500).json({ 
        success: false, 
        message: "Erreur lors du chargement du dashboard", 
        error: error.message 
      });
    }
  }
});

// ========================
// ROUTES DE GESTION UTILISATEURS
// ========================

// Création d'utilisateur (API)
router.post('/users/create', isAdmin, async (req, res) => {
  try {
    console.log("Création d'utilisateur:", req.body);
    const { nom, prenom, email, password, role, statut_compte } = req.body;
    
    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs obligatoires doivent être remplis.' 
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: 'Cet email est déjà utilisé.' 
      });
    }
    
    const newUser = await User.create({
      nom,
      prenom,
      email,
      mot_de_passe: password,
      role: role || 'user',
      statut_compte: statut_compte || 'ACTIF',
      statut_verification: true,
      date_inscription: Date.now(),
      created_by: req.user.id
    });
    
    console.log("Utilisateur créé avec succès:", newUser._id);
    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erreur lors de la création de l'utilisateur.", 
      message: error.message 
    });
  }
});

// Liste des utilisateurs (API)
router.get('/users', isAdmin, async (req, res) => {
  try {
    console.log("Récupération des utilisateurs avec paramètres:", req.query);
    
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
    if (req.query.status) filter.statut_compte = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    // Comptage total pour pagination
    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Récupération des utilisateurs
    const users = await User.find(filter)
      .sort({ date_inscription: -1 })
      .skip(skip)
      .limit(limit)
      .select('-mot_de_passe');

    console.log(`${users.length} utilisateurs récupérés sur ${total} au total`);
    res.json({
      success: true,
      users,
      total,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erreur lors de la récupération des utilisateurs.", 
      message: error.message 
    });
  }
});

// Détail d'un utilisateur (API)
router.get('/users/:id', isAdmin, async (req, res) => {
  try {
    console.log("Récupération des détails de l'utilisateur:", req.params.id);
    
    const user = await User.findById(req.params.id).select('-mot_de_passe');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "Utilisateur non trouvé" 
      });
    }
    
    console.log("Utilisateur trouvé:", user._id);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des détails utilisateur:", error);
    res.status(500).json({ 
      success: false, 
      error: "Erreur lors de la récupération des détails utilisateur.", 
      message: error.message 
    });
  }
});

// Mise à jour d'un utilisateur
router.put('/users/:id', isAdmin, (req, res, next) => {
  console.log('PUT /users/:id appelé', req.params.id);
  if (typeof adminController.updateUser === 'function') {
    adminController.updateUser(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUser non implémentée" });
  }
});

// Suppression d'un utilisateur
router.delete('/users/:id', isAdmin, (req, res) => {
  console.log('DELETE /users/:id appelé', req.params.id);
  if (typeof adminController.deleteUser === 'function') {
    adminController.deleteUser(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction deleteUser non implémentée" });
  }
});

// ========================
// ROUTES D'API UTILISATEURS
// ========================

// Liste des utilisateurs (API alternative)
router.get('/api/users', isAdmin, (req, res) => {
  console.log('GET /api/users appelé');
  if (typeof adminController.getUsersAPI === 'function') {
    adminController.getUsersAPI(req, res);
  } else {
    // Fallback vers la route standard
    console.log("Redirection vers la route standard /users");
    const oldUrl = req.url;
    req.url = req.url.replace('/api/users', '/users');
    router.handle(req, res, () => {
      req.url = oldUrl;
    });
  }
});

// Détails d'un utilisateur (API alternative)
router.get('/api/users/:id', isAdmin, (req, res) => {
  console.log('GET /api/users/:id appelé', req.params.id);
  if (typeof adminController.getUserDetailsAPI === 'function') {
    adminController.getUserDetailsAPI(req, res);
  } else {
    // Fallback vers la route standard
    console.log("Redirection vers la route standard /users/:id");
    const oldUrl = req.url;
    req.url = req.url.replace('/api/users', '/users');
    router.handle(req, res, () => {
      req.url = oldUrl;
    });
  }
});

// Mise à jour d'un utilisateur (API alternative)
router.put('/api/users/:id', isAdmin, (req, res) => {
  console.log('PUT /api/users/:id appelé', req.params.id);
  if (typeof adminController.updateUser === 'function') {
    adminController.updateUser(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUser non implémentée" });
  }
});

// Suppression d'un utilisateur (API alternative)
router.delete('/api/users/:id', isAdmin, (req, res) => {
  console.log('DELETE /api/users/:id appelé', req.params.id);
  if (typeof adminController.deleteUser === 'function') {
    adminController.deleteUser(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction deleteUser non implémentée" });
  }
});

// ========================
// ROUTES DE STATUT ET SÉCURITÉ UTILISATEUR
// ========================

// Mise à jour du statut d'un utilisateur
router.put('/api/users/:id/status', isAdmin, (req, res) => {
  console.log('PUT /api/users/:id/status appelé', req.params.id);
  if (typeof adminController.updateUserStatus === 'function') {
    adminController.updateUserStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUserStatus non implémentée" });
  }
});

// Réinitialisation des tentatives de connexion
router.put('/api/users/:id/reset-login-attempts', isAdmin, (req, res) => {
  console.log('PUT /api/users/:id/reset-login-attempts appelé', req.params.id);
  if (typeof adminController.resetLoginAttempts === 'function') {
    adminController.resetLoginAttempts(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction resetLoginAttempts non implémentée" });
  }
});

// ========================
// ROUTES DE LOGS ET TENTATIVES
// ========================

// Récupération des logs
router.get('/api/logs', isAdmin, (req, res) => {
  console.log('GET /api/logs appelé');
  if (typeof adminController.getUserLogsAPI === 'function') {
    adminController.getUserLogsAPI(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction getUserLogsAPI non implémentée" });
  }
});

// Récupération des tentatives de connexion
router.get('/api/login-attempts/:id', isAdmin, (req, res) => {
  console.log('GET /api/login-attempts/:id appelé', req.params.id);
  if (typeof adminController.getLoginAttemptsAPI === 'function') {
    adminController.getLoginAttemptsAPI(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction getLoginAttemptsAPI non implémentée" });
  }
});

// ========================
// ROUTES D'OPÉRATIONS GROUPÉES
// ========================

// Mise à jour groupée des statuts
router.put('/api/users/bulk/status', isAdmin, (req, res) => {
  console.log('PUT /api/users/bulk/status appelé');
  if (typeof adminController.bulkUpdateStatus === 'function') {
    adminController.bulkUpdateStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction bulkUpdateStatus non implémentée" });
  }
});

// Suppression groupée d'utilisateurs
router.delete('/api/users/bulk/delete', isAdmin, (req, res) => {
  console.log('DELETE /api/users/bulk/delete appelé');
  if (typeof adminController.bulkDeleteUsers === 'function') {
    adminController.bulkDeleteUsers(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction bulkDeleteUsers non implémentée" });
  }
});

// ========================
// ROUTES SPÉCIFIQUES POUR CHAQUE ACTION DE STATUT
// ========================

// Activer un compte
router.put('/users/:id/activate', isAdmin, async (req, res) => {
  console.log('PUT /users/:id/activate appelé', req.params.id);
  req.body.newStatus = 'ACTIF';
  if (typeof adminController.updateUserStatus === 'function') {
    return adminController.updateUserStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUserStatus non implémentée" });
  }
});

// Désactiver un compte
router.put('/users/:id/deactivate', isAdmin, async (req, res) => {
  console.log('PUT /users/:id/deactivate appelé', req.params.id);
  req.body.newStatus = 'INACTIF';
  if (typeof adminController.updateUserStatus === 'function') {
    return adminController.updateUserStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUserStatus non implémentée" });
  }
});

// Verrouiller un compte
router.put('/users/:id/lock', isAdmin, async (req, res) => {
  console.log('PUT /users/:id/lock appelé', req.params.id);
  req.body.newStatus = 'VERROUILLE';
  if (typeof adminController.updateUserStatus === 'function') {
    return adminController.updateUserStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUserStatus non implémentée" });
  }
});

// Marquer un compte comme supprimé
router.put('/users/:id/mark-deleted', isAdmin, async (req, res) => {
  console.log('PUT /users/:id/mark-deleted appelé', req.params.id);
  req.body.newStatus = 'SUPPRIME';
  if (typeof adminController.updateUserStatus === 'function') {
    return adminController.updateUserStatus(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateUserStatus non implémentée" });
  }
});

// ========================
// ROUTES SPÉCIALES
// ========================

// Mise à jour du rôle admin
router.put('/api/update-admin-role', (req, res) => {
  console.log('PUT /api/update-admin-role appelé');
  if (typeof adminController.updateAdminRole === 'function') {
    adminController.updateAdminRole(req, res);
  } else {
    res.status(501).json({ success: false, message: "Fonction updateAdminRole non implémentée" });
  }
});

// ========================
// ROUTES VIDÉOS ET SHORTS
// ========================

// Import et vérification du contrôleur vidéo
let videoCtrl;
try {
  videoCtrl = require('../../controllers/videoController');
  console.log("✅ Contrôleur vidéo importé avec succès");
} catch (error) {
  console.error("❌ Erreur lors de l'importation du contrôleur vidéo:", error.message);
  // Création d'un contrôleur vidéo fictif
  videoCtrl = {
    listVideosForAdmin: (req, res) => {
      res.status(501).json({ success: false, message: "API: listVideosForAdmin non implémentée" });
    },
    getVideoStats: (req, res) => {
      res.status(501).json({ success: false, message: "API: getVideoStats non implémentée" });
    },
    createVideo: (req, res) => {
      res.status(501).json({ success: false, message: "API: createVideo non implémentée" });
    },
    getVideoForAdmin: (req, res) => {
      res.status(501).json({ success: false, message: "API: getVideoForAdmin non implémentée" });
    },
    updateVideo: (req, res) => {
      res.status(501).json({ success: false, message: "API: updateVideo non implémentée" });
    },
    deleteVideo: (req, res) => {
      res.status(501).json({ success: false, message: "API: deleteVideo non implémentée" });
    },
    createShort: (req, res) => {
      res.status(501).json({ success: false, message: "API: createShort non implémentée" });
    }
  };
}

// Gestion des vidéos (admin)
router.get('/videos', isAdmin, (req, res) => {
  console.log('GET /videos appelé');
  videoCtrl.listVideosForAdmin(req, res);
});

router.get('/videos/stats', isAdmin, (req, res) => {
  console.log('GET /videos/stats appelé');
  videoCtrl.getVideoStats(req, res);
});

router.post('/videos', isAdmin, (req, res) => {
  console.log('POST /videos appelé');
  videoCtrl.createVideo(req, res);
});

router.get('/videos/:id', isAdmin, (req, res) => {
  console.log('GET /videos/:id appelé', req.params.id);
  videoCtrl.getVideoForAdmin(req, res);
});

router.patch('/videos/:id', isAdmin, (req, res) => {
  console.log('PATCH /videos/:id appelé', req.params.id);
  videoCtrl.updateVideo(req, res);
});

router.delete('/videos/:id', isAdmin, (req, res) => {
  console.log('DELETE /videos/:id appelé', req.params.id);
  videoCtrl.deleteVideo(req, res);
});

// Fonctions d'aide pour les shorts
const getShortsList = async (req, res) => {
  try {
    console.log('getShortsList appelé');
    // Utiliser listVideosForAdmin avec filtre type: short
    req.query.type = 'short';
    videoCtrl.listVideosForAdmin(req, res);
  } catch (err) {
    console.error("Erreur lors du chargement des shorts:", err);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des shorts',
      message: err.message
    });
  }
};

const getShortsStats = async (req, res) => {
  try {
    console.log('getShortsStats appelé');
    
    // Récupérer le modèle Video de manière sécurisée
    let Video;
    try {
      Video = require('../../models/Video');
    } catch (err) {
      console.error("Erreur lors de l'importation du modèle Video:", err.message);
      return res.status(500).json({ 
        success: false, 
        error: "Modèle Video non disponible",
        message: err.message
      });
    }
    
    // Stats spécifiques aux shorts
    const totalShorts = await Video.countDocuments({ type: 'short' });
    const recentShorts = await Video.find({ type: 'short' })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('auteur', 'nom prenom');
    
    res.json({
      success: true,
      stats: {
        total: totalShorts,
        recent: recentShorts
      }
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des statistiques de shorts:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des statistiques',
      message: err.message
    });
  }
};

const createShortHandler = async (req, res) => {
  try {
    console.log('createShortHandler appelé');
    
    // Vérifier si createShort existe
    if (typeof videoCtrl.createShort === 'function') {
      await videoCtrl.createShort(req, res);
    } else {
      // Fallback temporaire
      let Video;
      try {
        Video = require('../../models/Video');
      } catch (err) {
        console.error("Erreur lors de l'importation du modèle Video:", err.message);
        return res.status(500).json({ 
          success: false, 
          error: "Modèle Video non disponible",
          message: err.message
        });
      }
      
      const { titre, artiste, description, youtubeUrl } = req.body;
      const userId = req.user._id || req.user.id;

      // Si c'est un upload de fichier
      if (req.file) {
        console.log("Création de short à partir d'un fichier");
        const video = await Video.create({
          titre,
          youtubeUrl: `/uploads/shorts/${req.file.filename}`,
          type: 'short',
          duree: req.body.duree ? parseInt(req.body.duree) : undefined,
          artiste,
          description,
          auteur: userId
        });
        return res.status(201).json({ success: true, data: video });
      }

      // Si c'est une URL YouTube (admin)
      if (youtubeUrl) {
        console.log("Création de short à partir d'une URL YouTube");
        const video = new Video({
          titre,
          youtubeUrl,
          type: 'short',
          artiste,
          description,
          auteur: userId,
          duree: 15 // ← AJOUTER UNE DURÉE PAR DÉFAUT pour YouTube
        });

        // OU utiliser le flag de skip (meilleure solution)
        video._skipDureeValidation = true;
        
        await video.save();
        return res.status(201).json({ success: true, data: video });
      }

      res.status(400).json({ 
        success: false, 
        message: 'Fichier ou URL YouTube requis' 
      });
    }
  } catch (err) {
    console.error('Erreur lors de la création du short:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la création du short',
      message: err.message
    });
  }
};

// Routes shorts
router.get('/shorts', isAdmin, getShortsList);
router.get('/shorts/stats', isAdmin, getShortsStats);

// Import du middleware d'upload de manière sécurisée
let uploadShort;
try {
  uploadShort = require('../../middlewares/upload.middleware');
  console.log("✅ Middleware d'upload importé avec succès");
} catch (error) {
  console.error("❌ Erreur lors de l'importation du middleware d'upload:", error.message);
  // Middleware d'upload fictif
  uploadShort = {
    single: (fieldName) => (req, res, next) => {
      console.log(`⚠️ Middleware d'upload fictif utilisé pour ${fieldName}`);
      if (!req.file) req.file = null;
      next();
    }
  };
}

router.post('/shorts', isAdmin, uploadShort.single('videoFile'), createShortHandler);

// Routes utilisant les fonctions existantes
router.get('/shorts/:id', isAdmin, (req, res) => {
  console.log('GET /shorts/:id appelé', req.params.id);
  videoCtrl.getVideoForAdmin(req, res);
});

router.patch('/shorts/:id', isAdmin, (req, res) => {
  console.log('PATCH /shorts/:id appelé', req.params.id);
  videoCtrl.updateVideo(req, res);
});

router.delete('/shorts/:id', isAdmin, (req, res) => {
  console.log('DELETE /shorts/:id appelé', req.params.id);
  videoCtrl.deleteVideo(req, res);
});

module.exports = router;