// index.js - SERVEUR PRINCIPAL
require("dotenv").config();
const express = require("express");
const session = require('express-session');
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require('jsonwebtoken'); 
const cors = require('cors');
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const compression = require('compression'); 
const morgan = require('morgan'); 

// ===== IMPORTS DES SERVICES =====
// Import du service de planification des streams
const { initStreamScheduler } = require('./services/streamScheduler');

// Import du système de nettoyage automatique 
const { initializeStreamCleanup, healthCheck, getStats } = require('./tasks/streamCleanup');

const { initPlaylistStatsService } = require('./services/playlistStatsService');

// ===== Import des modèles (ordre important) =====
require('./models/User');
require('./models/Token');
require('./models/LoginAttempt');
require('./models/LogAction');
require('./models/Comment');    
require('./models/Like');       
require('./models/Playlist');
require('./models/Video');
require('./models/StatutUser');
require('./models/Preferences');
require('./models/Podcast');
require('./models/LiveStream');
require('./models/liveChatMessage');
require('./models/PlaylistAnalytics');
require('./models/Post'); 

const app = express();

// ===== VARIABLES GLOBALES POUR LES SERVICES =====
let streamCleanupService = null;
let streamSchedulerService = null;
let playlistStatsService = null; 

// ===== AMÉLIORATIONS DE SÉCURITÉ ET PERFORMANCE =====
// Protection HTTP avec Helmet (AJOUT)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false, 
  crossOriginResourcePolicy: false // IMPORTANT: Permets l'accès aux ressources statiques entre origines
}));

app.use(compression());

// Rate limiting global (AJOUT)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requêtes par IP sur la période
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: '15 minutes'
  }
});
app.use(globalLimiter);

// Rate limiting spécifique pour l'authentification (AJOUT)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives par IP sur la période
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de tentatives de connexion, veuillez réessayer plus tard',
    retryAfter: '15 minutes'
  }
});

// Logging HTTP détaillé (AJOUT)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ===== Middleware de base =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ===== Configuration CORS =====
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com',
    'https://throwback-backup-frontend.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Type', 'Content-Length'] // Ajout pour exposer ces headers
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ===== Configuration de session =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'throwback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24, 
    httpOnly: true
  }
}));

// ===== Configuration du moteur de template =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Fichiers statiques =====
// Middleware pour permettre l'accès aux ressources statiques entre origines
app.use('/uploads', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

app.use('/uploads', express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// ===== Logging des requêtes amélioré =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  
  // Log spécial pour les routes importantes
  if (req.url.includes('/shorts') || req.url.includes('/like') || req.url.includes('/memories') || 
      req.url.includes('/public') || req.url.includes('/livestreams') || req.url.includes('/livechat') ||
      req.url.includes('/health') || req.url.includes('/playlists')) {  
    console.log(` Route importante détectée: ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(' Body:', req.body);
    }
  }
  
  next();
});

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log("Connexion MongoDB réussie");
  console.log("Base de données:", mongoose.connection.db.databaseName);
  
  // Initialisation du service de planification des streams après connexion réussie
  try {
    streamSchedulerService = initStreamScheduler();
    console.log("Service de planification des livestreams initialisé");
  } catch (error) {
    console.error("Erreur lors de l'initialisation du service de planification des livestreams:", error);
  }

  // ===== INITIALISATION DU SYSTÈME DE NETTOYAGE AUTOMATIQUE =====
  if (process.env.ENABLE_STREAM_CLEANUP !== 'false') {
    try {
      console.log("Initialisation du système de nettoyage automatique des streams...");
      streamCleanupService = initializeStreamCleanup();
      console.log("Système de nettoyage automatique des streams initialisé");
      console.log("Tâches automatiques actives:");
      console.log("   Nettoyage des statuts: toutes les minutes");
      console.log("   Statistiques: toutes les 6 heures");
      console.log("   Maintenance: tous les jours à 3h00");
    } catch (error) {
      console.error("Erreur lors de l'initialisation du système de nettoyage:", error);
    }
  } else {
    console.log("Système de nettoyage automatique désactivé par variable d'environnement");
  }



// ===== INITIALISATION DU SERVICE DE STATISTIQUES PLAYLISTS  =====
if (process.env.ENABLE_PLAYLIST_STATS !== 'false') {
  try {
    console.log(" Initialisation du service de statistiques des playlists...");
    // Ne démarrez pas tout de suite le service
    playlistStatsService = initPlaylistStatsService();
    
    // Attendez un peu pour s'assurer que tous les modèles sont bien chargés
    setTimeout(() => {
      // Démarrer le service après un délai
      if (playlistStatsService.start()) {
        console.log(" Service de statistiques des playlists démarré avec succès");
        console.log(" Tâches de statistiques playlists actives:");
        console.log("    Calcul des tendances: toutes les 3 heures");
        console.log("    Mise à jour des lectures: toutes les 30 minutes");
        console.log("    Génération des recommandations: tous les jours à 4h00");
      } else {
        console.error(" Échec du démarrage du service de statistiques playlists");
      }
    }, 5000); // Attendre 5 secondes avant de démarrer le service
  } catch (error) {
    console.error(" Erreur lors de l'initialisation du service de statistiques playlists:", error);
  }
} else {
  console.log(" Service de statistiques des playlists désactivé par variable d'environnement");
}
})
.catch((err) => {
  console.error(" Erreur MongoDB:", err);
  process.exit(1);
});

// ===== Middleware d'authentification =====
const extractUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) { 
      token = req.cookies.token;
    }
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        // console.log(" Utilisateur connecté:", `${req.user.prenom} ${req.user.nom} (ID: ${req.user.id})`);
      } catch (error) {
        console.error(" Erreur de vérification du token:", error.message);
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  } catch (error) {
    console.error(" Erreur d'authentification:", error);
    req.user = null;
    next();
  }
};

const protect = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }
  next();
};

// Appliquer le middleware d'extraction d'utilisateur
app.use(extractUser);

// ===== Test des contrôleurs =====
let authController, memoryController, videoController, publicVideoController;
let userLiveStreamController, liveStreamController, liveChatController;
let playlistController; 

try {
  authController = require("./controllers/authController");
  memoryController = require('./controllers/memoryController');
  videoController = require('./controllers/videoController');
  publicVideoController = require('./controllers/publicVideoController');
  
  // Contrôleurs LiveStream
  userLiveStreamController = require('./controllers/userLiveStreamController');
  liveStreamController = require('./controllers/liveStreamController');
  liveChatController = require('./controllers/liveChatController');

 
  playlistController = require('./controllers/playlistController');
  
  console.log(" Tous les contrôleurs chargés avec succès");
} catch (error) {
  console.error(" Erreur lors du chargement des contrôleurs:", error);
}

// ===== NOUVELLES ROUTES DE SANTÉ ET MONITORING =====
console.log("\n Configuration des routes de santé...");

// Route de santé générale
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    },
    environment: process.env.NODE_ENV || 'development',
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      database: mongoose.connection.db?.databaseName
    },
    services: {
      streamCleanup: streamCleanupService ? 'active' : 'inactive',
      streamScheduler: streamSchedulerService ? 'active' : 'inactive',
      playlistStats: playlistStatsService ? 'active' : 'inactive' 
    }
  });
});

// Route de santé spécifique pour les streams
app.get('/api/health/streams', (req, res) => {
  try {
    if (!streamCleanupService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Stream cleanup service not initialized'
      });
    }
    
    const health = healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 500;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Route de santé spécifique pour les playlists (AJOUT)
app.get('/api/health/playlists', (req, res) => {
  try {
    if (!playlistStatsService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Playlist stats service not initialized'
      });
    }
    
    const health = playlistStatsService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 500;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Playlist health check failed',
      error: error.message
    });
  }
});

// Nouvelle route de statistiques des tâches
app.get('/api/admin/stream-tasks/status', protect, (req, res) => {
  if (!streamCleanupService) {
    return res.status(503).json({
      success: false,
      message: 'Stream cleanup service not initialized'
    });
  }
  
  try {
    const stats = getStats();
    const health = healthCheck();
    
    res.json({
      success: true,
      data: {
        stats,
        health,
        tasksInitialized: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting task status',
      error: error.message
    });
  }
});

// Nouvelle route pour déclencher un nettoyage manuel
app.post('/api/admin/stream-tasks/cleanup', protect, async (req, res) => {
  if (!streamCleanupService) {
    return res.status(503).json({
      success: false,
      message: 'Stream cleanup service not initialized'
    });
  }
  
  try {
    const result = await streamCleanupService.runManualCleanup();
    res.json({
      success: true,
      message: 'Manual cleanup completed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error running manual cleanup',
      error: error.message
    });
  }
});

// ===== ROUTES D'AUTHENTIFICATION =====
console.log("\n Configuration des routes d'authentification...");

// Appliquer le rate limiter aux routes d'authentification (AJOUT)
app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/auth/register', authLimiter, authController.register);
app.post('/api/auth/forgot-password', authLimiter, authController.forgotPassword);

// Routes d'authentification standard
app.get('/api/auth/verify/:id/:token', authController.verifyEmail);
app.post('/api/auth/resend-verification', authController.resendVerification);
app.get('/api/auth/verify-reset/:token', authController.verifyPasswordReset);
app.put('/api/auth/reset-password', authController.resetPassword);
app.put('/api/auth/change-password', protect, authController.changePassword);
app.post('/api/auth/logout', protect, authController.logout);
app.get('/api/auth/me', protect, authController.getMe);

// ===== ROUTES PUBLIQUES SPÉCIFIQUES (AVANT LES ROUTES GÉNÉRIQUES) =====
console.log(" Configuration des routes publiques...");

// Routes trending et recherche (AVANT /api/public/videos/:id)

// Les routes pour les podcasts
const podcastRoutes = require('./routes/api/podcastRoutes');
app.use('/api/podcasts', podcastRoutes);

app.get('/api/public/videos/trending', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/trending');
  if (publicVideoController && publicVideoController.getTrendingVideos) {
    publicVideoController.getTrendingVideos(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      message: "Trending videos service not available"
    });
  }
});

app.get('/api/public/videos/search', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/search');
  if (publicVideoController && publicVideoController.searchVideos) {
    publicVideoController.searchVideos(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      query: req.query.q,
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 }
    });
  }
});

// Route liste des vidéos publiques
app.get('/api/public/videos', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos');
  console.log(' Query params:', req.query);
  
  if (publicVideoController && publicVideoController.getPublicVideos) {
    publicVideoController.getPublicVideos(req, res, next);
  } else {
    // Fallback vers le contrôleur vidéo standard
    if (videoController && videoController.listPublicVideos) {
      videoController.listPublicVideos(req, res, next);
    } else {
      res.status(501).json({
        success: false,
        message: "Service de vidéos publiques temporairement indisponible"
      });
    }
  }
});

// Routes pour une vidéo spécifique et ses souvenirs
app.get('/api/public/videos/:id/memories', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/:id/memories');
  console.log(' Video ID:', req.params.id);
  
  if (memoryController && memoryController.getVideoMemories) {
    memoryController.getVideoMemories(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
    });
  }
});

app.post('/api/public/videos/:id/memories', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/memories');
  console.log(' Video ID:', req.params.id);
  console.log(' User:', req.user?.nom, req.user?.prenom);
  
  if (memoryController && memoryController.addMemory) {
    memoryController.addMemory(req, res, next);
  } else {
    res.status(501).json({
      success: false,
      message: "Service de souvenirs temporairement indisponible"
    });
  }
});

// Routes pour les likes
app.post('/api/public/videos/:id/like', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/like');
  console.log(' Video ID:', req.params.id);
  console.log(' User:', req.user?.nom, req.user?.prenom);
  
  if (publicVideoController && publicVideoController.likeVideo) {
    publicVideoController.likeVideo(req, res, next);
  } else {
    res.json({
      success: true,
      message: "Like enregistré (simulation)",
      data: {
        liked: true,
        disliked: false,
        likes: Math.floor(Math.random() * 100) + 1,
        dislikes: 0
      }
    });
  }
});

app.post('/api/public/videos/:id/share', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/share');
  console.log(' Video ID:', req.params.id);
  
  res.json({
    success: true,
    message: "Partage enregistré avec succès"
  });
});

// Route pour une vidéo spécifique (APRÈS toutes les routes spécifiques)
app.get('/api/public/videos/:id', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/:id');
  console.log(' Video ID:', req.params.id);
  
  if (publicVideoController && publicVideoController.getVideoById) {
    publicVideoController.getVideoById(req, res, next);
  } else {
    // Fallback vers le contrôleur vidéo standard
    if (videoController && videoController.getPublicVideo) {
      videoController.getPublicVideo(req, res, next);
    } else {
      res.status(501).json({
        success: false,
        message: "Service de vidéo publique temporairement indisponible"
      });
    }
  }
});

// ===== ROUTES VIDÉO PRINCIPALES =====
console.log(" Configuration des routes vidéo...");

const videoRoutes = require('./routes/api/videoRoutes');
app.use('/api/videos', videoRoutes);

// ===== CONFIGURATION DES ROUTES LIVESTREAM =====
console.log(" Configuration des routes LiveThrowback...");

// Routes admin pour les livestreams (avec middleware automatique)
try {
  const adminLiveStreamRoutes = require('./routes/api/liveStreamRoutes');
  app.use('/api/admin/livestreams', adminLiveStreamRoutes);
  console.log(" Routes admin livestreams chargées");
} catch (error) {
  console.warn(" Routes admin livestreams non disponibles:", error.message);
}

// Dans index.js ou app.js
// Ajouter cette ligne pour rendre les routes accessibles sous les deux chemins
app.use('/api/livestreams/admin', require('./routes/api/liveStreamRoutes'));

// Routes utilisateur pour les livestreams (avec middleware automatique)
try {
  const userLiveStreamsRoutes = require('./routes/api/userLivestreams');
  app.use('/api/user/livestreams', userLiveStreamsRoutes);
  console.log(" Routes utilisateur livestreams chargées");
} catch (error) {
  console.warn(" Routes utilisateur livestreams non disponibles:", error.message);
}

// Routes principales des livestreams (legacy - peut-être à supprimer plus tard)
try {
  const liveStreamRoutes = require('./routes/api/liveStreamRoutes');
  app.use('/api/livestreams', liveStreamRoutes);
  console.log(" Routes principales livestreams chargées");
} catch (error) {
  console.warn(" Routes principales livestreams non disponibles:", error.message);
}

// ===== CONFIGURATION DES ROUTES DE CHAT EN DIRECT =====
console.log(" Configuration des routes de chat en direct...");
try {
  const liveChatRoutes = require('./routes/api/liveChat');
  app.use('/api/livechat', liveChatRoutes);
  console.log(" Routes de chat en direct chargées avec succès");
} catch (error) {
  console.warn(" Routes de chat en direct non disponibles:", error.message);
}

// ===== CONFIGURATION DES ROUTES PLAYLISTS =====
console.log("🎵 Configuration des routes de playlists...");

// Router principal (toutes les routes /api/playlists/*)
const playlistRoutes = require('./routes/api/playlistRoutes');
app.use('/api/playlists', playlistRoutes);


// Routes pour les posts et commentaires

const commentRoutes = require('./routes/api/comments');
app.use('/api/comments', commentRoutes);
const postRoutes = require('./routes/api/posts');
app.use('/api/posts', postRoutes);



// Routes publiques playlists (SEO / lecture publique)

// Routes admin des playlists
try {
  const adminPlaylistRoutes = require('./routes/api/adminplaylistRoutes');
  app.use('/api/admin/playlists', adminPlaylistRoutes);
  console.log(" Routes admin playlists chargées avec succès");
} catch (error) {
  console.warn(" Routes admin playlists non disponibles:", error.message);
}

// Routes publiques des playlists
app.get('/api/public/playlists/trending', (req, res, next) => {
  console.log(' Route publique: GET /api/public/playlists/trending');
  if (playlistController && playlistController.getTrendingPlaylists) {
    playlistController.getTrendingPlaylists(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      message: "Trending playlists service not available"
    });
  }
});

app.get('/api/public/playlists/search', (req, res, next) => {
  console.log(' Route publique: GET /api/public/playlists/search');
  if (playlistController && playlistController.searchPlaylists) {
    playlistController.searchPlaylists(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      query: req.query.q,
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 }
    });
  }
});

app.get('/api/public/playlists', (req, res, next) => {
  console.log(' Route publique: GET /api/public/playlists');
  if (playlistController && playlistController.getPublicPlaylists) {
    playlistController.getPublicPlaylists(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
    });
  }
});

app.get('/api/public/playlists/:id', (req, res, next) => {
  console.log('🎵 Route publique: GET /api/public/playlists/:id');
  if (playlistController && playlistController.getPublicPlaylistById) {
    playlistController.getPublicPlaylistById(req, res, next);
  } else {
    res.status(501).json({
      success: false,
      message: "Service de playlist publique temporairement indisponible"
    });
  }
});

// ===== ROUTES SUPPLÉMENTAIRES =====
console.log(" Configuration des routes supplémentaires...");

// Routes utilisateur
const userProfileRoutes = require('./routes/api/userProfile');
app.use('/api/users', userProfileRoutes);

// Routes administrateur
const adminApiRoutes = require('./routes/api/admin');
app.use('/api/admin', adminApiRoutes);

// Routes memories
try {
  const memoriesRoutes = require('./routes/api/memories');
  app.use('/api/memories', memoriesRoutes);
} catch (error) {
  console.warn(" Routes memories non disponibles:", error.message);
}

// Routes publiques (fichier séparé)
try {
  const publicRoutes = require('./routes/api/public');
  app.use('/api/public', publicRoutes);
} catch (error) {
  console.warn(" Routes publiques (fichier) non disponibles:", error.message);
}

// Routes CAPTCHA
try {
  const captchaRoutes = require("./routes/api/captcha");
  app.use("/api/captcha", captchaRoutes);
} catch (error) {
  console.warn(" Routes CAPTCHA non disponibles:", error.message);
}

// Routes pour récupérer les informations vidéo par URL
try {
  const videoInfoRoutes = require('./routes/api/videoInfoRoutes');
  app.use('/api/video-info', videoInfoRoutes);
  console.log(" Routes video-info chargées avec succès");
} catch (error) {
  console.warn(" Routes video-info non disponibles:", error.message);
  
  // Fallback pour le développement
  app.get('/api/video-info', (req, res) => {
    const { url, id, source } = req.query;
    
    if (!url || !id || !source) {
      return res.status(400).json({
        success: false,
        message: 'URL, ID et source sont requis'
      });
    }
    
    // Simuler une réponse pour le développement
    res.json({
      success: true,
      title: `Vidéo ${source} - ${id}`,
      description: 'Description simulée pour cette vidéo (mode développement)',
      thumbnail: source === 'youtube' ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '/images/video-placeholder.jpg',
      duration: '3:45',
      channel: 'Chaîne simulée',
      publishedAt: new Date().toISOString(),
      simulatedData: true
    });
  });
  console.log(" Route de fallback video-info configurée pour le développement");
}

// ===== CONFIGURATION DE LA DOCUMENTATION SWAGGER/OPENAPI (AJOUT) =====
try {
  const swaggerUi = require('swagger-ui-express');
  const swaggerJsDoc = require('swagger-jsdoc');

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ThrowBack API',
        version: '2.3.0',
        description: 'API de la plateforme ThrowBack',
        contact: {
          name: 'Équipe ThrowBack',
          email: 'contact@throwback.com'
        }
      },
      servers: [
        {
          url: process.env.BACKEND_URL || 'http://localhost:4000',
          description: 'Serveur principal'
        }
      ]
    },
    apis: [
      './routes/api/*.js',
      './routes/api/admin/*.js',
      './controllers/*.js'
    ]
  };

  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  console.log(" Documentation Swagger disponible sur /api-docs");
} catch (error) {
  console.warn(" Documentation Swagger non disponible:", error.message);
}

// ===== AFFICHAGE DES ROUTES DISPONIBLES =====
console.log("\n Routes LiveThrowback configurées:");
console.log("    GET  /api/admin/livestreams/stats (statistiques)");
console.log("    GET  /api/admin/livestreams/all (tous les livestreams admin)");
console.log("    GET  /api/admin/livestreams/live (livestreams en cours)");
console.log("    GET  /api/admin/livestreams/scheduled (livestreams programmés)");
console.log("    POST /api/admin/livestreams (créer un livestream) (Admin)");
console.log("    PUT  /api/admin/livestreams/:id (modifier un livestream) (Admin)");
console.log("    DELETE /api/admin/livestreams/:id (supprimer un livestream) (Admin)");
console.log("    PUT  /api/admin/livestreams/:id/start (démarrer un livestream) (Admin)");
console.log("    PUT  /api/admin/livestreams/:id/end (terminer un livestream) (Admin)");
console.log("    PUT  /api/admin/livestreams/:id/cancel (annuler un livestream) (Admin)");
console.log("    GET  /api/user/livestreams (livestreams actifs pour utilisateurs)");
console.log("    GET  /api/user/livestreams/:id (détail d'un livestream pour utilisateurs)");
console.log("    POST /api/user/livestreams/:id/like (liker un livestream) (Protected)");
console.log("    POST /api/user/livestreams/:id/comment (commenter un livestream) (Protected)");
console.log("    GET  /api/user/livestreams/:id/comments (commentaires d'un livestream)");

console.log("\n Routes de chat en direct configurées:");
console.log("    GET  /api/livechat/:streamId (liste des messages)");
console.log("    POST /api/livechat/:streamId (ajouter un message) (Protected)");
console.log("    POST /api/livechat/:streamId/messages/:messageId/like (liker un message) (Protected)");
console.log("    DELETE /api/livechat/:streamId/messages/:messageId (supprimer un message) (Protected)");
console.log("    POST /api/livechat/:streamId/messages/:messageId/report (signaler un message) (Protected)");

console.log("\n Routes de santé et monitoring:");
console.log("    GET  /api/health (santé générale du serveur)");
console.log("    GET  /api/health/streams (santé des tâches de streams)");
console.log("    GET  /api/health/playlists (santé des tâches de playlists)");
console.log("    GET  /api/admin/stream-tasks/status (statut des tâches) (Protected)");
console.log("    POST /api/admin/stream-tasks/cleanup (nettoyage manuel) (Protected)");

console.log("\n🎵 Routes playlists configurées:");
console.log("    GET  /api/playlists (liste des playlists)");
console.log("    GET  /api/playlists/:id (détail d'une playlist)");
console.log("    GET  /api/playlists/stats (statistiques des playlists)");
console.log("    GET  /api/admin/playlists (liste admin des playlists)");
console.log("    PUT  /api/admin/playlists/:id (modifier une playlist) (Admin)");
console.log("    DELETE  /api/admin/playlists/:id (supprimer une playlist) (Admin)");
console.log("    POST /api/admin/playlists/:id/videos (ajouter une vidéo) (Admin)");
console.log("    DELETE /api/admin/playlists/:id/videos/:videoId (supprimer une vidéo) (Admin)");
console.log("    PUT  /api/admin/playlists/:id/reorder (réorganiser les vidéos) (Admin)");
console.log("    PUT  /api/admin/playlists/:id/collaborateurs (gérer les collaborateurs) (Admin)");
console.log("    GET  /api/public/playlists/trending (playlists tendances)");
console.log("    GET  /api/public/playlists/search (recherche de playlists)");
console.log("    GET  /api/public/playlists (playlists publiques)");
console.log("    GET  /api/public/playlists/:id (détail d'une playlist publique)");

console.log("\n Routes publiques configurées:");
console.log("    GET  /api/public/videos/trending");
console.log("    GET  /api/public/videos/search"); 
console.log("    GET  /api/public/videos");
console.log("    GET  /api/public/videos/:id");
console.log("    GET  /api/public/videos/:id/memories");
console.log("    POST /api/public/videos/:id/memories (Protected)");
console.log("    POST /api/public/videos/:id/like (Protected)");
console.log("    POST /api/public/videos/:id/share (Protected)");

// ===== ROUTES DE TEST AMÉLIORÉES =====
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API ThrowBack fonctionne!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    services: {
      streamCleanup: streamCleanupService ? 'active' : 'inactive',
      streamScheduler: streamSchedulerService ? 'active' : 'inactive',
      playlistStats: playlistStatsService ? 'active' : 'inactive' 
    }
  });
});

app.get('/api/test/db', async (req, res) => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    // Test d'une requête simple
    const User = mongoose.model('User');
    const userCount = await User.countDocuments();
    
    res.json({
      mongodb: {
        status: states[state],
        database: mongoose.connection.db?.databaseName,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        userCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database connection error',
      message: error.message
    });
  }
});

// Test spécifique pour les streams avec nettoyage automatique
app.get('/api/test/streams', async (req, res) => {
  try {
    const LiveStream = mongoose.model('LiveStream');
    
    // Compter les streams par statut
    const stats = await LiveStream.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Informations sur les tâches automatiques
    const taskHealth = streamCleanupService ? healthCheck() : { status: 'inactive' };
    
    res.json({
      message: 'Test des fonctionnalités de streams',
      user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
      streamStats: stats,
      automaticTasks: {
        cleanupService: streamCleanupService ? 'active' : 'inactive',
        schedulerService: streamSchedulerService ? 'active' : 'inactive',
        health: taskHealth
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Stream test error',
      message: error.message
    });
  }
});

// Test spécifique pour les playlists (AJOUT)
app.get('/api/test/playlists', async (req, res) => {
  try {
    const Playlist = mongoose.model('Playlist');
    
    // Compter les playlists par visibilité
    const visibilityStats = await Playlist.aggregate([
      { $group: { _id: '$visibilite', count: { $sum: 1 } } }
    ]);
    
    // Compter les playlists par type
    const typeStats = await Playlist.aggregate([
      { $group: { _id: '$type_playlist', count: { $sum: 1 } } }
    ]);
    
    // Récupérer quelques statistiques
    const totalPlaylists = await Playlist.countDocuments();
    const publicPlaylists = await Playlist.countDocuments({ visibilite: 'PUBLIC' });
    
    res.json({
      message: 'Test des fonctionnalités de playlists',
      user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
      playlistStats: {
        total: totalPlaylists,
        public: publicPlaylists,
        byVisibility: visibilityStats,
        byType: typeStats
      },
      automaticTasks: {
        playlistStatsService: playlistStatsService ? 'active' : 'inactive'
      },
      availableRoutes: [
        'GET /api/playlists (liste des playlists)',
        'GET /api/playlists/:id (détail d\'une playlist)',
        'GET /api/playlists/stats (statistiques des playlists)',
        'GET /api/admin/playlists (liste admin des playlists)',
        'PUT /api/admin/playlists/:id (modifier une playlist) (Admin)',
        'DELETE /api/admin/playlists/:id (supprimer une playlist) (Admin)',
        'POST /api/admin/playlists/:id/videos (ajouter une vidéo) (Admin)',
        'DELETE /api/admin/playlists/:id/videos/:videoId (supprimer une vidéo) (Admin)',
        'PUT /api/admin/playlists/:id/reorder (réorganiser les vidéos) (Admin)',
        'PUT /api/admin/playlists/:id/collaborateurs (gérer les collaborateurs) (Admin)'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Playlist test error',
      message: error.message
    });
  }
});

// Test spécifique pour les shorts
app.get('/api/test/shorts', protect, (req, res) => {
  res.json({
    message: 'Route shorts accessible',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    userId: req.user?._id || req.user?.id,
    timestamp: new Date().toISOString()
  });
});

// Test spécifique pour les routes publiques
app.get('/api/test/public', (req, res) => {
  res.json({
    message: 'Routes publiques accessibles',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    availableRoutes: [
      'GET /api/public/videos',
      'GET /api/public/videos/trending',
      'GET /api/public/videos/search',
      'GET /api/public/videos/:id',
      'GET /api/public/videos/:id/memories',
      'POST /api/public/videos/:id/like',
      'POST /api/public/videos/:id/memories',
      'GET /api/public/playlists',
      'GET /api/public/playlists/trending',
      'GET /api/public/playlists/search',
      'GET /api/public/playlists/:id'
    ],
    timestamp: new Date().toISOString()
  });
});

// Test pour les livestreams avec statut des tâches automatiques
app.get('/api/test/livestreams', async (req, res) => {
  try {
    const LiveStream = mongoose.model('LiveStream');
    const liveCount = await LiveStream.countDocuments({ status: 'LIVE' });
    const scheduledCount = await LiveStream.countDocuments({ status: 'SCHEDULED' });
    
    res.json({
      message: 'Routes LiveThrowback accessibles',
      user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
      currentStats: {
        liveStreams: liveCount,
        scheduledStreams: scheduledCount
      },
      automaticFeatures: {
        autoStatusUpdate: streamCleanupService ? 'active' : 'inactive',
        scheduleService: streamSchedulerService ? 'active' : 'inactive'
      },
      availableRoutes: [
        'GET /api/user/livestreams (seuls les streams LIVE non expirés)',
        'GET /api/user/livestreams/:id',
        'POST /api/user/livestreams/:id/like (Protected)',
        'POST /api/user/livestreams/:id/comment (Protected)',
        'GET /api/admin/livestreams/stats (Protected)',
        'GET /api/admin/livestreams/all (Protected)',
        'POST /api/admin/livestreams (Protected)',
        'PUT /api/admin/livestreams/:id/start (Protected)',
        'PUT /api/admin/livestreams/:id/end (Protected)'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Livestream test error',
      message: error.message
    });
  }
});

// Test pour le chat en direct
app.get('/api/test/livechat', (req, res) => {
  res.json({
    message: 'Routes LiveChat accessibles',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    availableRoutes: [
      'GET /api/livechat/:streamId (liste des messages)',
      'POST /api/livechat/:streamId (ajouter un message)',
      'POST /api/livechat/:streamId/messages/:messageId/like (liker un message)',
      'DELETE /api/livechat/:streamId/messages/:messageId (supprimer un message)',
      'POST /api/livechat/:streamId/messages/:messageId/report (signaler un message)'
    ],
    features: [
      'Chat en temps réel',
      'Modération automatique',
      'Bannissement d\'utilisateurs',
      'Système de likes sur messages',
      'Signalement de contenu'
    ],
    timestamp: new Date().toISOString()
  });
});

// Routes de recherche
console.log(" Configuration des routes de recherche...");
try {
  const searchController = require('./controllers/searchController');
  
  // Route de recherche globale
  app.get('/api/search', searchController.globalSearch);
  
  // Routes de recherche spécifiques
  app.get('/api/search/videos', searchController.searchVideos);
  app.get('/api/search/playlists', searchController.searchPlaylists);
  app.get('/api/search/podcasts', searchController.searchPodcasts);
  app.get('/api/search/livestreams', searchController.searchLivestreams);
  
  // Route pour les suggestions de recherche
  app.get('/api/search/suggestions', searchController.getSearchSuggestions);
  
  console.log(" Routes de recherche chargées avec succès");
} catch (error) {
  console.warn(" Routes de recherche non disponibles:", error.message);
}


// ===== ROUTES DE FALLBACK WEB =====
app.get("/", (req, res) => {
  res.json({
    message: "ThrowBack API Server",
    version: "2.4.0", 
    status: "Opérationnel",
    newFeatures: [
      " Module Playlists complet",
      " Statistiques avancées des playlists",
      " Playlists collaboratives",
      " Recherche optimisée des playlists",
      " Sécurité renforcée",
      " Documentation API intégrée",
      " Nettoyage automatique des streams",
      " Monitoring avancé des tâches",
      " Gestion intelligente des statuts LIVE",
      " Progression automatique des compilations",
      " Chat en direct avec modération"
    ],
    endpoints: {
      auth: "/api/auth/*",
      videos: "/api/videos/*",
      publicVideos: "/api/public/videos/*",
      userLivestreams: "/api/user/livestreams/*",
      adminLivestreams: "/api/admin/livestreams/*",
      playlists: "/api/playlists/*", 
      adminPlaylists: "/api/admin/playlists/*", 
      publicPlaylists: "/api/public/playlists/*", 
      livechat: "/api/livechat/*",
      health: "/api/health",
      shorts: "/api/videos/shorts",
      memories: "/api/videos/:id/memories",
      likes: "/api/videos/:id/like",
      admin: "/api/admin/*",
      test: "/api/test",
      docs: "/api-docs" 
    },
    services: {
      streamCleanup: streamCleanupService ? ' Active' : ' Inactive',
      streamScheduler: streamSchedulerService ? ' Active' : ' Inactive',
      playlistStats: playlistStatsService ? ' Active' : ' Inactive', 
      database: mongoose.connection.readyState === 1 ? ' Connected' : ' Disconnected'
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/login", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com'}/login`);
});

app.get("/register", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com'}/register`);
});

// ===== GESTION DES ERREURS 404 AMÉLIORÉE =====
app.use((req, res, next) => {
  console.log(` 404 ERROR: ${req.method} ${req.path}`);
  
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: "Route API non trouvée",
      path: req.path,
      method: req.method,
      suggestion: "Vérifiez l'URL dans la documentation",
      availableRoutes: [
        'GET /api/health (santé du serveur)',
        'GET /api/health/streams (santé des streams)',
        'GET /api/health/playlists (santé des playlists)',
        'GET /api/user/livestreams (streams actifs)',
        'GET /api/public/videos (liste des vidéos publiques)',
        'GET /api/public/videos/:id (détails d\'une vidéo)',
        'POST /api/videos/shorts (création de short)',
        'POST /api/public/videos/:id/like (liker une vidéo)', 
        'POST /api/public/videos/:id/memories (ajouter un souvenir)',
        'GET /api/playlists (liste des playlists)', 
        'GET /api/playlists/:id (détail d\'une playlist)', 
        'GET /api/livechat/:streamId (messages de chat)',
        'GET /api/auth/me (infos utilisateur)',
        'GET /api/test (test de l\'API)',
        'GET /api/test/streams (test des streams)',
        'GET /api/test/playlists (test des playlists)', 
        'GET /api-docs (documentation complète de l\'API)' 
      ]
    });
  }
  
  res.status(404).json({
    error: "Page non trouvée",
    message: `La route ${req.path} n'existe pas`
  });
});

// ===== GESTION DES ERREURS 500 AMÉLIORÉE =====
app.use((err, req, res, next) => {
  console.error(" Erreur serveur:", err);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(" Stack trace:", err.stack);
  }
  
  const response = {
    success: false,
    message: "Une erreur est survenue sur le serveur",
    timestamp: new Date().toISOString(),
    services: {
      streamCleanup: streamCleanupService ? 'active' : 'inactive',
      streamScheduler: streamSchedulerService ? 'active' : 'inactive',
      playlistStats: playlistStatsService ? 'active' : 'inactive' 
    }
  };
  
  if (process.env.NODE_ENV === 'development') {
    response.error = {
      message: err.message,
      stack: err.stack
    };
  }
  
  res.status(500).json(response);
});

// ===== GESTION DE L'ARRÊT GRACIEUX AMÉLIORÉE =====
const gracefulShutdown = (signal) => {
  console.log(`\n Signal ${signal} reçu. Arrêt gracieux en cours...`);
  
  // Arrêter les nouveaux connexions
  server.close(() => {
    console.log(' Serveur HTTP fermé');
    
    // Arrêter les services
    if (streamCleanupService) {
      console.log(' Arrêt du service de nettoyage des streams...');
      // Le service a son propre gestionnaire de shutdown
    }
    
    if (streamSchedulerService) {
      console.log(' Arrêt du service de planification des streams...');
    }
    
    if (playlistStatsService) {
      console.log(' Arrêt du service de statistiques des playlists...');
      // Arrêter proprement le service
      playlistStatsService.shutdown();
    }
    
    // Fermer la connexion MongoDB
    mongoose.connection.close(() => {
      console.log(' Connexion MongoDB fermée');
      console.log(' Arrêt complet du serveur ThrowBack');
      process.exit(0);
    });
  });
  
  // Force l'arrêt après 30 secondes
  setTimeout(() => {
    console.error(' Arrêt forcé après timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  console.error(' Unhandled Promise Rejection:', err);
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (err) => {
  console.error(' Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

// ===== LANCEMENT DU SERVEUR =====
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`\n ========================================`);
  console.log(`  SERVEUR THROWBACK DÉMARRÉ AVEC SUCCÈS!`);
  console.log(` ========================================`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Frontend: ${process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com'}`);
  console.log(`  Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`\n  ROUTES PRINCIPALES:`);
  console.log(`    POST /api/videos/shorts (Upload de shorts)`);
  console.log(`    POST /api/public/videos/:id/like (Liker une vidéo)`);
  console.log(`    POST /api/public/videos/:id/memories (Ajouter un souvenir)`);
  console.log(`    GET  /api/public/videos (Liste des vidéos publiques)`);
  console.log(`    GET  /api/playlists (Liste des playlists)`);
  console.log(`    GET  /api/playlists/:id (Détail d'une playlist)`);
  console.log(`    GET  /api/user/livestreams (Streams actifs seulement)`);
  console.log(`    GET  /api/admin/livestreams/stats (Statistiques admin)`);
  console.log(`    GET  /api/livechat/:streamId (Messages de chat en direct)`);
  console.log(`    POST /api/livechat/:streamId (Envoi de message en direct)`);
  console.log(`    POST /api/auth/login (Connexion)`);
  console.log(`    GET  /api/health (Santé du serveur)`);
  console.log(`\n  NOUVELLES FONCTIONNALITÉS:`);
  console.log(`     Module Playlists complet`);
  console.log(`     Statistiques avancées des playlists`);
  console.log(`     Playlists collaboratives`);
  console.log(`     Recherche optimisée des playlists`);
  console.log(`     Sécurité renforcée`);
  console.log(`     Documentation API intégrée (swagger)`);
  console.log(`     Nettoyage automatique des statuts (toutes les minutes)`);
  console.log(`     Monitoring avancé des streams`);
  console.log(`     Seuls les streams LIVE non expirés s'affichent`);
  console.log(`     Progression automatique des compilations`);
  console.log(`     Chat en direct avec modération`);
  console.log(`\n  THROWBACK EST MAINTENANT COMPLÈTE AVEC PLAYLISTS! \n`);
});

module.exports = { app, server };