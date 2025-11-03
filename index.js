// index.js - VERSION AVEC SOCKET.IO INTÉGRÉ
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

// ===== IMPORTS SOCKET.IO =====
const { Server } = require('socket.io');
const http = require('http');
const { initializeSocketIO, getOnlineUsersCount, isUserOnline, getOnlineUsers } = require('./socket/socketHandler');

// ===== IMPORTS DES SERVICES =====
const { initStreamScheduler } = require('./services/streamScheduler');
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
require('./models/FriendGroup');
require('./models/Friendship');
require('./models/Message');
require('./models/Bookmark');
require('./models/Memory');

// ===== CRÉATION DU SERVEUR HTTP =====
const app = express();
const httpServer = http.createServer(app);

// ===== CONFIGURATION SOCKET.IO =====
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com',
      'https://throwback-backup-frontend.onrender.com',
      'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: {
    threshold: 1024
  }
});

// Rendre io accessible dans les routes
app.set('io', io);

// ===== VARIABLES GLOBALES POUR LES SERVICES =====
let streamCleanupService = null;
let streamSchedulerService = null;
let playlistStatsService = null;

// ===== AMÉLIORATIONS DE SÉCURITÉ ET PERFORMANCE =====
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false, 
  crossOriginResourcePolicy: false 
}));

app.use(compression());

// Rate limiting global 
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: '15 minutes'
  }
});
app.use(globalLimiter);

// Rate limiting spécifique pour l'authentification 
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de tentatives de connexion, veuillez réessayer plus tard',
    retryAfter: '15 minutes'
  }
});

// Logging HTTP détaillé
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
    process.env.FRONTEND_URL || 'https://testfrontend.throwback-connect.com',
    'https://testfrontend.throwback-connect.com',
    'http://localhost:3000'
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
  exposedHeaders: ['Content-Type', 'Content-Length']
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
  
  if (req.url.includes('/shorts') || req.url.includes('/like') || req.url.includes('/memories') || 
      req.url.includes('/public') || req.url.includes('/livestreams') || req.url.includes('/livechat') ||
      req.url.includes('/health') || req.url.includes('/playlists') || req.url.includes('/friends') || 
      req.url.includes('/messages')) {  
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
  console.log(" Connexion MongoDB réussie");
  console.log(" Base de données:", mongoose.connection.db.databaseName);
  
  // ===== INITIALISATION SOCKET.IO =====
  try {
    initializeSocketIO(io);
    console.log(" Socket.IO initialisé avec succès");
    console.log(" Utilisateurs en ligne: 0");
  } catch (error) {
    console.error(" Erreur lors de l'initialisation de Socket.IO:", error);
  }
  
  // Initialisation du service de planification des streams
  try {
    streamSchedulerService = initStreamScheduler();
    console.log(" Service de planification des livestreams initialisé");
  } catch (error) {
    console.error(" Erreur lors de l'initialisation du service de planification des livestreams:", error);
  }

  // ===== INITIALISATION DU SYSTÈME DE NETTOYAGE AUTOMATIQUE =====
  if (process.env.ENABLE_STREAM_CLEANUP !== 'false') {
    try {
      console.log(" Initialisation du système de nettoyage automatique des streams...");
      streamCleanupService = initializeStreamCleanup();
      console.log(" Système de nettoyage automatique des streams initialisé");
      console.log(" Tâches automatiques actives:");
      console.log("   Nettoyage des statuts: toutes les minutes");
      console.log("    Statistiques: toutes les 6 heures");
      console.log("     Maintenance: tous les jours à 3h00");
    } catch (error) {
      console.error(" Erreur lors de l'initialisation du système de nettoyage:", error);
    }
  } else {
    console.log("  Système de nettoyage automatique désactivé par variable d'environnement");
  }

  // ===== INITIALISATION DU SERVICE DE STATISTIQUES PLAYLISTS =====
  if (process.env.ENABLE_PLAYLIST_STATS !== 'false') {
    try {
      console.log(" Initialisation du service de statistiques des playlists...");
      playlistStatsService = initPlaylistStatsService();
      
      setTimeout(() => {
        if (playlistStatsService.start()) {
          console.log(" Service de statistiques des playlists démarré avec succès");
          console.log(" Tâches de statistiques playlists actives:");
          console.log("    Calcul des tendances: toutes les 3 heures");
          console.log("   Mise à jour des lectures: toutes les 30 minutes");
          console.log("    Génération des recommandations: tous les jours à 4h00");
        } else {
          console.error(" Échec du démarrage du service de statistiques playlists");
        }
      }, 5000);
    } catch (error) {
      console.error(" Erreur lors de l'initialisation du service de statistiques playlists:", error);
    }
  } else {
    console.log("  Service de statistiques des playlists désactivé par variable d'environnement");
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
      } catch (error) {
        console.error("  Erreur de vérification du token:", error.message);
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
  
  userLiveStreamController = require('./controllers/userLiveStreamController');
  liveStreamController = require('./controllers/liveStreamController');
  liveChatController = require('./controllers/liveChatController');
  playlistController = require('./controllers/playlistController');
  
  console.log(" Tous les contrôleurs chargés avec succès");
} catch (error) {
  console.error(" Erreur lors du chargement des contrôleurs:", error);
}

// ===== ROUTES DE SANTÉ ET MONITORING =====
console.log("\n🏥 Configuration des routes de santé...");

// Route de santé générale (avec Socket.IO)
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
    socketio: {
      status: 'active',
      onlineUsers: getOnlineUsersCount(),
      transport: 'websocket/polling'
    },
    services: {
      streamCleanup: streamCleanupService ? 'active' : 'inactive',
      streamScheduler: streamSchedulerService ? 'active' : 'inactive',
      playlistStats: playlistStatsService ? 'active' : 'inactive'
    }
  });
});

// Route pour obtenir le nombre d'utilisateurs en ligne
app.get('/api/status/online-users', (req, res) => {
  res.json({
    success: true,
    count: getOnlineUsersCount(),
    timestamp: new Date().toISOString()
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

// Route de santé spécifique pour les playlists
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

// Route de statistiques des tâches
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

// Route pour déclencher un nettoyage manuel
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
console.log("\n🔐 Configuration des routes d'authentification...");

app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/auth/register', authLimiter, authController.register);
app.post('/api/auth/forgot-password', authLimiter, authController.forgotPassword);
app.get('/api/auth/verify/:id/:token', authController.verifyEmail);
app.post('/api/auth/resend-verification', authController.resendVerification);
app.get('/api/auth/verify-reset/:token', authController.verifyPasswordReset);
app.put('/api/auth/reset-password', authController.resetPassword);
app.put('/api/auth/change-password', protect, authController.changePassword);
app.post('/api/auth/logout', protect, authController.logout);
app.get('/api/auth/me', protect, authController.getMe);

// ===== ROUTES PUBLIQUES SPÉCIFIQUES =====
console.log("🌐 Configuration des routes publiques...");

const podcastRoutes = require('./routes/api/podcastRoutes');
app.use('/api/podcasts', podcastRoutes);

app.get('/api/public/videos/trending', (req, res, next) => {
  if (publicVideoController && publicVideoController.getTrendingVideos) {
    publicVideoController.getTrendingVideos(req, res, next);
  } else {
    res.json({ success: true, data: [], message: "Trending videos service not available" });
  }
});

app.get('/api/public/videos/search', (req, res, next) => {
  if (publicVideoController && publicVideoController.searchVideos) {
    publicVideoController.searchVideos(req, res, next);
  } else {
    res.json({ success: true, data: [], query: req.query.q, pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } });
  }
});

app.get('/api/public/videos', (req, res, next) => {
  if (publicVideoController && publicVideoController.getPublicVideos) {
    publicVideoController.getPublicVideos(req, res, next);
  } else if (videoController && videoController.listPublicVideos) {
    videoController.listPublicVideos(req, res, next);
  } else {
    res.status(501).json({ success: false, message: "Service de vidéos publiques temporairement indisponible" });
  }
});

app.get('/api/public/videos/:id/memories', (req, res, next) => {
  if (memoryController && memoryController.getVideoMemories) {
    memoryController.getVideoMemories(req, res, next);
  } else {
    res.json({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  }
});

app.post('/api/public/videos/:id/memories', protect, (req, res, next) => {
  if (memoryController && memoryController.addMemory) {
    memoryController.addMemory(req, res, next);
  } else {
    res.status(501).json({ success: false, message: "Service de souvenirs temporairement indisponible" });
  }
});

app.post('/api/public/videos/:id/like', protect, (req, res, next) => {
  if (publicVideoController && publicVideoController.likeVideo) {
    publicVideoController.likeVideo(req, res, next);
  } else {
    res.json({ success: true, message: "Like enregistré (simulation)", data: { liked: true, disliked: false, likes: Math.floor(Math.random() * 100) + 1, dislikes: 0 } });
  }
});

app.post('/api/public/videos/:id/share', protect, (req, res, next) => {
  res.json({ success: true, message: "Partage enregistré avec succès" });
});

app.get('/api/public/videos/:id', (req, res, next) => {
  if (publicVideoController && publicVideoController.getVideoById) {
    publicVideoController.getVideoById(req, res, next);
  } else if (videoController && videoController.getPublicVideo) {
    videoController.getPublicVideo(req, res, next);
  } else {
    res.status(501).json({ success: false, message: "Service de vidéo publique temporairement indisponible" });
  }
});

// ===== ROUTES VIDÉO PRINCIPALES =====
console.log("🎬 Configuration des routes vidéo...");
const videoRoutes = require('./routes/api/videoRoutes');
app.use('/api/videos', videoRoutes);

// ===== ROUTES LIVESTREAM =====
console.log("📺 Configuration des routes LiveThrowback...");

try {
  const adminLiveStreamRoutes = require('./routes/api/liveStreamRoutes');
  app.use('/api/admin/livestreams', adminLiveStreamRoutes);
  app.use('/api/livestreams/admin', adminLiveStreamRoutes);
  console.log(" Routes admin livestreams chargées");
} catch (error) {
  console.warn("  Routes admin livestreams non disponibles:", error.message);
}

try {
  const userLiveStreamsRoutes = require('./routes/api/userLivestreams');
  app.use('/api/user/livestreams', userLiveStreamsRoutes);
  console.log(" Routes utilisateur livestreams chargées");
} catch (error) {
  console.warn("  Routes utilisateur livestreams non disponibles:", error.message);
}

try {
  const liveStreamRoutes = require('./routes/api/liveStreamRoutes');
  app.use('/api/livestreams', liveStreamRoutes);
  console.log(" Routes principales livestreams chargées");
} catch (error) {
  console.warn("  Routes principales livestreams non disponibles:", error.message);
}

// ===== ROUTES DE CHAT EN DIRECT =====
console.log("💬 Configuration des routes de chat en direct...");
try {
  const liveChatRoutes = require('./routes/api/liveChat');
  app.use('/api/livechat', liveChatRoutes);
  console.log(" Routes de chat en direct chargées avec succès");
} catch (error) {
  console.warn("  Routes de chat en direct non disponibles:", error.message);
}

// ===== ROUTES PLAYLISTS =====
console.log(" Configuration des routes de playlists...");
const playlistRoutes = require('./routes/api/playlistRoutes');
app.use('/api/playlists', playlistRoutes);

try {
  const adminPlaylistRoutes = require('./routes/api/adminplaylistRoutes');
  app.use('/api/admin/playlists', adminPlaylistRoutes);
  console.log(" Routes admin playlists chargées avec succès");
} catch (error) {
  console.warn("  Routes admin playlists non disponibles:", error.message);
}

app.get('/api/public/playlists/trending', (req, res, next) => {
  if (playlistController && playlistController.getTrendingPlaylists) {
    playlistController.getTrendingPlaylists(req, res, next);
  } else {
    res.json({ success: true, data: [], message: "Trending playlists service not available" });
  }
});

app.get('/api/public/playlists/search', (req, res, next) => {
  if (playlistController && playlistController.searchPlaylists) {
    playlistController.searchPlaylists(req, res, next);
  } else {
    res.json({ success: true, data: [], query: req.query.q, pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } });
  }
});

app.get('/api/public/playlists', (req, res, next) => {
  if (playlistController && playlistController.getPublicPlaylists) {
    playlistController.getPublicPlaylists(req, res, next);
  } else {
    res.json({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  }
});

app.get('/api/public/playlists/:id', (req, res, next) => {
  if (playlistController && playlistController.getPublicPlaylistById) {
    playlistController.getPublicPlaylistById(req, res, next);
  } else {
    res.status(501).json({ success: false, message: "Service de playlist publique temporairement indisponible" });
  }
});

// ===== ROUTES POSTS ET COMMENTAIRES =====
console.log("📝 Configuration des routes posts et commentaires...");
const postRoutes = require('./routes/api/posts');
app.use('/api/posts', postRoutes);
app.use('/api/comments', require('./routes/api/comments'));

const adminPostRoutes = require('./routes/api/adminPostRoutes');
app.use('/api/admin/posts', adminPostRoutes);

// ===== ROUTES AMIS ET MESSAGES (AVEC SOCKET.IO) =====
console.log(" Configuration des routes amis et messages...");

const friendsRoutes = require('./routes/api/friends');
app.use('/api/friends', friendsRoutes);

const messagesRoutes = require('./routes/api/messages');
app.use('/api/messages', messagesRoutes);

const friendGroupsRoutes = require('./routes/api/friendGroups');
app.use('/api/friends', friendGroupsRoutes);


// ===== ROUTES SUPPLÉMENTAIRES =====
console.log(" Configuration des routes supplémentaires...");

app.use('/api/users', require('./routes/api/userProfile'));

const adminApiRoutes = require('./routes/api/admin');
app.use('/api/admin', adminApiRoutes);

try {
  const adminCommentsRoutes = require('./routes/api/adminCommentsRoutes');
  app.use('/api/admin/comments', adminCommentsRoutes);
  console.log(" Routes admin commentaires chargées avec succès");
} catch (error) {
  console.warn("  Routes admin commentaires non disponibles:", error.message);
}

const adminLikesRoutes = require('./routes/api/adminLikesRoutes');
app.use('/api/admin/likes', adminLikesRoutes);

app.use('/api', require('./routes/search'));

try {
  const memoriesRoutes = require('./routes/api/memories');
  app.use('/api/memories', memoriesRoutes);
} catch (error) {
  console.warn("  Routes memories non disponibles:", error.message);
}

try {
  const publicRoutes = require('./routes/api/public');
  app.use('/api/public', publicRoutes);
} catch (error) {
  console.warn("  Routes publiques (fichier) non disponibles:", error.message);
}

try {
  const captchaRoutes = require("./routes/api/captcha");
  app.use("/api/captcha", captchaRoutes);
} catch (error) {
  console.warn("  Routes CAPTCHA non disponibles:", error.message);
}

try {
  const videoInfoRoutes = require('./routes/api/videoInfoRoutes');
  app.use('/api/video-info', videoInfoRoutes);
  console.log(" Routes video-info chargées avec succès");
} catch (error) {
  console.warn("  Routes video-info non disponibles:", error.message);
  
  app.get('/api/video-info', (req, res) => {
    const { url, id, source } = req.query;
    if (!url || !id || !source) {
      return res.status(400).json({ success: false, message: 'URL, ID et source sont requis' });
    }
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
}

try {
  const swaggerUi = require('swagger-ui-express');
  const swaggerJsDoc = require('swagger-jsdoc');

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ThrowBack API',
        version: '2.5.0',
        description: 'API de la plateforme ThrowBack avec Socket.IO',
        contact: {
          name: 'Équipe ThrowBack',
          email: 'contact@throwback.com'
        }
      },
      servers: [{ url: process.env.BACKEND_URL || 'http://localhost:4000', description: 'Serveur principal' }]
    },
    apis: ['./routes/api/*.js', './routes/api/admin/*.js', './controllers/*.js']
  };

  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  console.log("📚 Documentation Swagger disponible sur /api-docs");
} catch (error) {
  console.warn("  Documentation Swagger non disponible:", error.message);
}

// ===== ROUTES DE RECHERCHE =====
console.log("🔍 Configuration des routes de recherche...");
try {
  const searchController = require('./controllers/searchController');
  app.get('/api/search', searchController.globalSearch);
  app.get('/api/search/videos', searchController.searchVideos);
  app.get('/api/search/playlists', searchController.searchPlaylists);
  app.get('/api/search/podcasts', searchController.searchPodcasts);
  app.get('/api/search/livestreams', searchController.searchLivestreams);
  app.get('/api/search/suggestions', searchController.getSearchSuggestions);
  console.log(" Routes de recherche chargées avec succès");
} catch (error) {
  console.warn("  Routes de recherche non disponibles:", error.message);
}

// ===== ROUTES DE TEST =====
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API ThrowBack fonctionne avec Socket.IO!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    socketio: {
      status: 'active',
      onlineUsers: getOnlineUsersCount()
    },
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
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
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
    res.status(500).json({ error: 'Database connection error', message: error.message });
  }
});

app.get('/api/test/socketio', (req, res) => {
  res.json({
    message: 'Socket.IO est actif!',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    socketio: {
      status: 'active',
      onlineUsers: getOnlineUsersCount(),
      onlineUsersList: getOnlineUsers().slice(0, 10)
    },
    features: [
      'Chat en temps réel',
      'Notifications instantanées',
      'Statut en ligne/hors ligne',
      'Indicateurs de saisie',
      'Demandes d\'amis en temps réel'
    ],
    timestamp: new Date().toISOString()
  });
});

// ===== ROUTES DE FALLBACK =====
app.get("/", (req, res) => {
  res.json({
    message: "ThrowBack API Server with Socket.IO",
    version: "2.5.0",
    status: "Opérationnel",
    newFeatures: [
      " Socket.IO intégré pour le temps réel",
      "💬 Chat en temps réel",
      "🔔 Notifications instantanées",
      " Statut en ligne/hors ligne",
      "📝 Indicateurs de saisie",
      " Module Playlists complet",
      " Statistiques avancées",
      "🔒 Sécurité renforcée",
      "📚 Documentation API intégrée"
    ],
    endpoints: {
      auth: "/api/auth/*",
      videos: "/api/videos/*",
      friends: "/api/friends/*",
      messages: "/api/messages/*",
      playlists: "/api/playlists/*",
      livestreams: "/api/livestreams/*",
      health: "/api/health",
      socketio: "/api/status/online-users",
      docs: "/api-docs"
    },
    services: {
      socketio: '🟢 Active',
      streamCleanup: streamCleanupService ? '🟢 Active' : '🔴 Inactive',
      streamScheduler: streamSchedulerService ? '🟢 Active' : '🔴 Inactive',
      playlistStats: playlistStatsService ? '🟢 Active' : '🔴 Inactive',
      database: mongoose.connection.readyState === 1 ? '🟢 Connected' : '🔴 Disconnected'
    },
    socketio: {
      onlineUsers: getOnlineUsersCount(),
      transport: 'websocket/polling'
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

// ===== GESTION DES ERREURS 404 =====
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
        'GET /api/health',
        'GET /api/status/online-users',
        'GET /api/friends',
        'GET /api/messages/conversations',
        'POST /api/messages',
        'GET /api-docs'
      ]
    });
  }
  
  res.status(404).json({
    error: "Page non trouvée",
    message: `La route ${req.path} n'existe pas`
  });
});

// ===== GESTION DES ERREURS 500 =====
app.use((err, req, res, next) => {
  console.error(" Erreur serveur:", err);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(" Stack trace:", err.stack);
  }
  
  const response = {
    success: false,
    message: "Une erreur est survenue sur le serveur",
    timestamp: new Date().toISOString()
  };
  
  if (process.env.NODE_ENV === 'development') {
    response.error = {
      message: err.message,
      stack: err.stack
    };
  }
  
  res.status(500).json(response);
});

// ===== GESTION DE L'ARRÊT GRACIEUX =====
const gracefulShutdown = (signal) => {
  console.log(`\n  Signal ${signal} reçu. Arrêt gracieux en cours...`);
  
  httpServer.close(() => {
    console.log(' Serveur HTTP fermé');
    
    // Fermer Socket.IO
    io.close(() => {
      console.log(' Socket.IO fermé');
      
      // Arrêter les services
      if (streamCleanupService) {
        console.log(' Arrêt du service de nettoyage des streams...');
      }
      
      if (streamSchedulerService) {
        console.log(' Arrêt du service de planification des streams...');
      }
      
      if (playlistStatsService) {
        console.log(' Arrêt du service de statistiques des playlists...');
        playlistStatsService.shutdown();
      }
      
      // Fermer MongoDB
      mongoose.connection.close(() => {
        console.log(' Connexion MongoDB fermée');
        console.log('👋 Arrêt complet du serveur ThrowBack');
        process.exit(0);
      });
    });
  });
  
  setTimeout(() => {
    console.error('  Arrêt forcé après timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
httpServer.listen(PORT, () => {
  console.log(`\n🎉 ========================================`);
  console.log(`  SERVEUR THROWBACK AVEC SOCKET.IO ACTIF!`);
  console.log(`🎉 ========================================`);
  console.log(`  🌐 URL: http://localhost:${PORT}`);
  console.log(`   Socket.IO: Active`);
  console.log(`   Online Users: ${getOnlineUsersCount()}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  🎨 Frontend: ${process.env.FRONTEND_URL || 'https://throwback-backup-frontend.onrender.com'}`);
  console.log(`  📚 Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`\n  🚀 ROUTES SOCKET.IO:`);
  console.log(`     WebSocket: ws://localhost:${PORT}`);
  console.log(`     GET /api/status/online-users`);
  console.log(`    🏥 GET /api/health (inclut status Socket.IO)`);
  console.log(`    🧪 GET /api/test/socketio (test Socket.IO)`);
  console.log(`\n  💬 ÉVÉNEMENTS SOCKET.IO:`);
  console.log(`    ✓ send-message (Envoyer un message)`);
  console.log(`    ✓ typing-start / typing-stop (Indicateur de saisie)`);
  console.log(`    ✓ friend-request-sent (Demande d'ami)`);
  console.log(`    ✓ join-livestream (Rejoindre un live)`);
  console.log(`    ✓ online-users (Liste des utilisateurs en ligne)`);
  console.log(`\n   THROWBACK AVEC SOCKET.IO EST PRÊT! \n`);
});

module.exports = { app, httpServer, io };