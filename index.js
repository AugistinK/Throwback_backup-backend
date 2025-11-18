// index.js - VERSION CORRIGÉE AVEC SOCKET.IO ET TRUST PROXY
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

require("dotenv").config();

// ===== SOCKET.IO =====
const { Server } = require('socket.io');
const http = require('http');
const { initializeSocketIO, getOnlineUsersCount, isUserOnline, getOnlineUsers } = require('./socket/socketHandler');

// ===== SERVICES =====
const { initStreamScheduler } = require('./services/streamScheduler');
const { initializeStreamCleanup, healthCheck, getStats } = require('./tasks/streamCleanup');
const { initPlaylistStatsService } = require('./services/playlistStatsService');

// ===== Modèles (ordre important) =====
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
require('./models/Conversation');
require('./models/Report');
require('./models/Notification');

// ===== CRÉATION APP / HTTP / IO =====
const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
process.env.FRONTEND_URL || 'https://testfrontend.throwback-connect.com',
'https://testfrontend.throwback-connect.com',
'http://localhost:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: { threshold: 1024 }
});

// Rendre io accessible aux routes
app.set('io', io);

//  Très important : derrière Nginx/Proxy
// CETTE LIGNE DOIT ÊTRE AVANT TOUT MIDDLEWARE
app.set('trust proxy', 1);
console.log(' Trust proxy configured');

// ===== VARIABLES SERVICES =====
let streamCleanupService = null;
let streamSchedulerService = null;
let playlistStatsService = null;

// ===== SÉCURITÉ & PERF =====
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(compression());

// ===== Rate limiting =====
//  Fonctionne maintenant correctement grâce à trust proxy
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { 
    success: false, 
    message: 'Trop de requêtes, veuillez réessayer plus tard', 
    retryAfter: '15 minutes' 
  }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { 
    success: false, 
    message: 'Trop de tentatives de connexion, veuillez réessayer plus tard', 
    retryAfter: '15 minutes' 
  }
});

// ===== Logs HTTP =====
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ===== Parsers/Cookies =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ===== CORS =====
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

// ===== Sessions (MongoStore en prod) =====
const MongoStore = require('connect-mongo');
app.use(session({
  secret: process.env.SESSION_SECRET || 'throwback-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 60 * 60 * 24,
    autoRemove: 'interval',
    autoRemoveInterval: 10
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));
console.log(' Session store configured with MongoStore');

// ===== Vues =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Statics (avec CORP) =====
app.use('/uploads', (req, res, next) => {
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => res.header('Cross-Origin-Resource-Policy', 'cross-origin')
}));
app.use('/uploads', express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res) => res.header('Cross-Origin-Resource-Policy', 'cross-origin')
}));

// ===== Logging custom =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (
    req.url.includes('/shorts') || req.url.includes('/like') || req.url.includes('/memories') ||
    req.url.includes('/public') || req.url.includes('/livestreams') || req.url.includes('/livechat') ||
    req.url.includes('/health') || req.url.includes('/playlists') || req.url.includes('/friends') ||
    req.url.includes('/messages')
  ) {
    console.log(` Route importante détectée: ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
console.log(' Body:', req.body);
    }
  }
  next();
});

// ===== MongoDB =====
//  : Configuration strictQuery
mongoose.set('strictQuery', false);
console.log(' Mongoose strictQuery configured');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log(" Connexion MongoDB réussie");
  console.log(" Base de données:", mongoose.connection.db.databaseName);

  // Socket.IO
  try {
    initializeSocketIO(io);
    console.log(" Socket.IO initialisé avec succès");
    console.log(" Utilisateurs en ligne: 0");
  } catch (error) {
    console.error(" Erreur init Socket.IO:", error);
  }

  // Stream scheduler
  try {
    streamSchedulerService = initStreamScheduler();
    console.log(" Service de planification des livestreams initialisé");
  } catch (error) {
    console.error(" Erreur init scheduler:", error);
  }

  // Cleanup automatique
  if (process.env.ENABLE_STREAM_CLEANUP !== 'false') {
    try {
console.log("🧹 Initialisation du système de nettoyage automatique des streams...");
streamCleanupService = initializeStreamCleanup();
console.log(" Système de nettoyage automatique des streams initialisé");
console.log("    Tâches automatiques actives:");
console.log("- Nettoyage des statuts: toutes les minutes");
console.log("- Statistiques: toutes les 6 heures");
console.log("- Maintenance: tous les jours à 3h00");
    } catch (error) {
console.error(" Erreur init cleanup:", error);
    }
  } else {
    console.log("  Système de nettoyage automatique désactivé par variable d'environnement");
  }

  // Playlist stats
  if (process.env.ENABLE_PLAYLIST_STATS !== 'false') {
    try {
console.log(" Initialisation du service de statistiques des playlists...");
playlistStatsService = initPlaylistStatsService();
setTimeout(() => {
  if (playlistStatsService.start()) {
    console.log(" Service de statistiques des playlists démarré avec succès");
    console.log("    Tâches actives: tendances 3h, lectures 30m, reco 4h00");
  } else {
    console.error(" Échec du démarrage du service de statistiques playlists");
  }
}, 5000);
    } catch (error) {
console.error(" Erreur init playlist stats:", error);
    }
  } else {
    console.log("  Service de statistiques des playlists désactivé par variable d'environnement");
  }
}).catch((err) => {
  console.error(" Erreur MongoDB:", err);
  process.exit(1);
});

// ===== Auth middlewares =====
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

app.use(extractUser);

// ===== Controllers (chargement sécurisé) =====
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

// ===== Health & monitoring =====
console.log("\n Configuration des routes de santé...");
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
    },
    configuration: {
trustProxy: app.get('trust proxy'),
strictQuery: 'false'
    }
  });
});

app.get('/api/status/online-users', (req, res) => {
  res.json({ 
    success: true, 
    count: getOnlineUsersCount(), 
    timestamp: new Date().toISOString() 
  });
});

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
data: { stats, health, tasksInitialized: true } 
    });
  } catch (error) {
    res.status(500).json({ 
success: false, 
message: 'Error getting task status', 
error: error.message 
    });
  }
});

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

// ===== Auth =====
console.log("\n Configuration des routes d'authentification...");
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
console.log(" Routes d'authentification configurées");

// ===== Routes publiques =====
console.log("\n Configuration des routes publiques...");
const podcastRoutes = require('./routes/api/podcastRoutes');
app.use('/api/podcasts', podcastRoutes);

app.get('/api/public/videos/trending', (req, res, next) => {
  if (publicVideoController?.getTrendingVideos) return publicVideoController.getTrendingVideos(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    message: "Trending videos service not available" 
  });
});

app.get('/api/public/videos/search', (req, res, next) => {
  if (publicVideoController?.searchVideos) return publicVideoController.searchVideos(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    query: req.query.q, 
    pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } 
  });
});

app.get('/api/public/videos', (req, res, next) => {
  if (publicVideoController?.getPublicVideos) return publicVideoController.getPublicVideos(req, res, next);
  if (videoController?.listPublicVideos) return videoController.listPublicVideos(req, res, next);
  res.status(501).json({ 
    success: false, 
    message: "Service de vidéos publiques temporairement indisponible" 
  });
});

app.get('/api/public/videos/:id/memories', (req, res, next) => {
  if (memoryController?.getVideoMemories) return memoryController.getVideoMemories(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } 
  });
});

app.post('/api/public/videos/:id/memories', protect, (req, res, next) => {
  if (memoryController?.addMemory) return memoryController.addMemory(req, res, next);
  res.status(501).json({ 
    success: false, 
    message: "Service de souvenirs temporairement indisponible" 
  });
});

app.post('/api/public/videos/:id/like', protect, (req, res, next) => {
  if (publicVideoController?.likeVideo) return publicVideoController.likeVideo(req, res, next);
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
});

app.post('/api/public/videos/:id/share', protect, (req, res) => {
  res.json({ 
    success: true, 
    message: "Partage enregistré avec succès" 
  });
});

app.get('/api/public/videos/:id', (req, res, next) => {
  if (publicVideoController?.getVideoById) return publicVideoController.getVideoById(req, res, next);
  if (videoController?.getPublicVideo) return videoController.getPublicVideo(req, res, next);
  res.status(501).json({ 
    success: false, 
    message: "Service de vidéo publique temporairement indisponible" 
  });
});

console.log(" Routes publiques configurées");

// ===== Vidéos =====
console.log("\n Configuration des routes vidéo...");
const videoRoutes = require('./routes/api/videoRoutes');
app.use('/api/videos', videoRoutes);
console.log(" Routes vidéo configurées");

// ===== Livestream =====
console.log("\n Configuration des routes LiveThrowback...");
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

// ===== Live Chat =====
console.log("\n Configuration des routes de chat en direct...");
try {
  const liveChatRoutes = require('./routes/api/liveChat');
  app.use('/api/livechat', liveChatRoutes);
  console.log(" Routes de chat en direct chargées avec succès");
} catch (error) {
  console.warn("  Routes de chat en direct non disponibles:", error.message);
}

// ===== Playlists =====
console.log("\n🎵 Configuration des routes de playlists...");
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
  if (playlistController?.getTrendingPlaylists) return playlistController.getTrendingPlaylists(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    message: "Trending playlists service not available" 
  });
});

app.get('/api/public/playlists/search', (req, res, next) => {
  if (playlistController?.searchPlaylists) return playlistController.searchPlaylists(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    query: req.query.q, 
    pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } 
  });
});

app.get('/api/public/playlists', (req, res, next) => {
  if (playlistController?.getPublicPlaylists) return playlistController.getPublicPlaylists(req, res, next);
  res.json({ 
    success: true, 
    data: [], 
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } 
  });
});

app.get('/api/public/playlists/:id', (req, res, next) => {
  if (playlistController?.getPublicPlaylistById) return playlistController.getPublicPlaylistById(req, res, next);
  res.status(501).json({ 
    success: false, 
    message: "Service de playlist publique temporairement indisponible" 
  });
});

console.log(" Routes playlists configurées");

// ===== Posts & Comments =====
console.log("\n Configuration des routes posts et commentaires...");
const postRoutes = require('./routes/api/posts');
app.use('/api/posts', postRoutes);
app.use('/api/comments', require('./routes/api/comments'));

const adminPostRoutes = require('./routes/api/adminPostRoutes');
app.use('/api/admin/posts', adminPostRoutes);
console.log(" Routes posts et commentaires configurées");

// =====  Friends & Messages =====
console.log("\n Configuration des routes amis et messages...");
try {
  const friendsRoutes = require('./routes/api/friends');
  app.use('/api/friends', friendsRoutes);
  console.log(" Routes FRIENDS chargées avec succès");
  console.log("    Routes disponibles:");
  console.log("- GET    /api/friends");
  console.log("- GET    /api/friends/requests");
  console.log("- GET    /api/friends/suggestions");
  console.log("- GET    /api/friends/stats");
  console.log("- POST   /api/friends/request");
  console.log("- PUT    /api/friends/accept/:friendshipId");
  console.log("- DELETE /api/friends/reject/:friendshipId");
  console.log("- DELETE /api/friends/remove/:friendId");
} catch (error) {
  console.error(" ERREUR CRITIQUE: Routes friends non chargées:", error.message);
  console.error("   Stack:", error.stack);
}

try {
  const messagesRoutes = require('./routes/api/messages');
  app.use('/api/messages', messagesRoutes);
  console.log(" Routes MESSAGES chargées avec succès");
  console.log("    Routes disponibles:");
  console.log("- GET  /api/messages/conversations");
  console.log("- GET  /api/messages/:friendId");
  console.log("- POST /api/messages");
  console.log("- GET  /api/messages/unread/count");
} catch (error) {
  console.error(" ERREUR CRITIQUE: Routes messages non chargées:", error.message);
  console.error("   Stack:", error.stack);
}

// ===== Conversations =====

const conversationsRoutes = require('./routes/api/conversations');
app.use('/api/conversations', conversationsRoutes);

const chatActionsRouter = require('./routes/api/chatActions');
app.use('/api/chat', chatActionsRouter);

// après avoir configuré app, auth, etc.
const notificationRoutes = require('./routes/api/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// =========Routes admin Friends and Chat==============
const adminFriendsChatRoutes = require('./routes/api/adminFriendsChatRoutes');
app.use('/api/admin/friends-chat', adminFriendsChatRoutes);

// // ===== Groups & Group Messages =====
// const groupsRoutes = require('./routes/api/groups');
// app.use('/api/groups', groupsRoutes);



// ===== Supplémentaires =====
console.log("\n🔧 Configuration des routes supplémentaires...");
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
  console.log(" Routes memories chargées");
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
  console.log(" Routes CAPTCHA chargées");
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
return res.status(400).json({ 
  success: false, 
  message: 'URL, ID et source sont requis' 
});
    }
    res.json({
success: true,
title: `Vidéo ${source} - ${id}`,
description: 'Description simulée pour cette vidéo (mode développement)',
thumbnail: source === 'youtube' 
  ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` 
  : '/images/video-placeholder.jpg',
duration: '3:45',
channel: 'Chaîne simulée',
publishedAt: new Date().toISOString(),
simulatedData: true
    });
  });
}

console.log(" Routes supplémentaires configurées");

// ===== Swagger Documentation =====
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
servers: [
  { 
    url: process.env.BACKEND_URL || 'http://localhost:5000', 
    description: 'Serveur principal' 
  }
]
    },
    apis: ['./routes/api/*.js', './routes/api/admin/*.js', './controllers/*.js']
  };

  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  console.log(" Documentation Swagger disponible sur /api-docs");
} catch (error) {
  console.warn("  Documentation Swagger non disponible:", error.message);
}

// ===== Recherche =====
console.log("\n Configuration des routes de recherche...");
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

// ===== Tests =====
console.log("\n Configuration des routes de test...");
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
    },
    configuration: {
trustProxy: app.get('trust proxy'),
strictQuery: 'false'
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

//  NOUVEAU: Test routes friends
app.get('/api/test/friends', (req, res) => {
  res.json({
    message: 'Routes Friends Test',
    status: 'OK',
    availableRoutes: {
get_friends: 'GET /api/friends',
get_requests: 'GET /api/friends/requests',
get_suggestions: 'GET /api/friends/suggestions',
send_request: 'POST /api/friends/request',
accept_request: 'PUT /api/friends/accept/:friendshipId',
reject_request: 'DELETE /api/friends/reject/:friendshipId',
remove_friend: 'DELETE /api/friends/remove/:friendId'
    },
    note: 'Toutes les routes nécessitent une authentification (Bearer token)',
    timestamp: new Date().toISOString()
  });
});

console.log(" Routes de test configurées");

// ===== Fallback root =====
app.get("/", (req, res) => {
  res.json({
    message: "ThrowBack API Server with Socket.IO",
    version: "2.5.0",
    status: "Opérationnel",
    newFeatures: [
" Socket.IO intégré pour le temps réel",
" Chat en temps réel",
" Notifications instantanées",
" Statut en ligne/hors ligne",
" Indicateurs de saisie",
" Module Playlists complet",
" Statistiques avancées",
" Sécurité renforcée",
" Système d'amis corrigé",
" Documentation API intégrée"
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
docs: "/api-docs",
test: "/api/test/friends"
    },
    services: {
socketio: ' Active',
streamCleanup: streamCleanupService ? ' Active' : ' Inactive',
streamScheduler: streamSchedulerService ? ' Active' : ' Inactive',
playlistStats: playlistStatsService ? ' Active' : ' Inactive',
database: mongoose.connection.readyState === 1 ? ' Connected' : ' Disconnected'
    },
    configuration: {
trustProxy: app.get('trust proxy'),
strictQuery: 'false',
environment: process.env.NODE_ENV || 'development'
    },
    socketio: { 
onlineUsers: getOnlineUsersCount(), 
transport: 'websocket/polling' 
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/login", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://testfrontend.throwback-connect.com'}/login`);
});

app.get("/register", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://testfrontend.throwback-connect.com'}/register`);
});

// ===== 404 =====
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
  'GET /api/friends/requests',
  'PUT /api/friends/accept/:friendshipId',
  'GET /api/messages/conversations',
  'POST /api/messages',
  'GET /api-docs',
  'GET /api/test/friends'
],
documentation: '/api-docs'
    });
  }
  res.status(404).json({ 
    error: "Page non trouvée", 
    message: `La route ${req.path} n'existe pas` 
  });
});

// ===== 500 =====
app.use((err, req, res, next) => {
  console.error(" Erreur serveur:", err);
  if (process.env.NODE_ENV === 'development') {
    console.error("📍 Stack trace:", err.stack);
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

// ===== Arrêt gracieux =====
const gracefulShutdown = (signal) => {
  console.log(`\n  Signal ${signal} reçu. Arrêt gracieux en cours...`);
  httpServer.close(() => {
    console.log(' Serveur HTTP fermé');
    io.close(() => {
console.log(' Socket.IO fermé');
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
mongoose.connection.close(() => {
  console.log(' Connexion MongoDB fermée');
  console.log(' Arrêt complet du serveur ThrowBack');
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

// ===== LANCEMENT =====
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  SERVEUR THROWBACK AVEC SOCKET.IO ACTIF!`);
  console.log(`========================================`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Socket.IO: Active`);
  console.log(` Online Users: ${getOnlineUsersCount()}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Frontend: ${process.env.FRONTEND_URL || 'https://testfrontend.throwback-connect.com'}`);
  console.log(` Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`\n  CONFIGURATION:`);
  console.log(`    Trust Proxy: ${app.get('trust proxy')}`);
  console.log(`    Mongoose strictQuery: false`);
  console.log(`    MongoStore: Active`);
  console.log(`\n ROUTES SOCKET.IO:`);
  console.log(`    WebSocket: ws://localhost:${PORT}`);
  console.log(`    GET /api/status/online-users`);
  console.log(`    GET /api/health (inclut status Socket.IO)`);
  console.log(`    GET /api/test/socketio (test Socket.IO)`);
  console.log(`\n ÉVÉNEMENTS SOCKET.IO:`);
  console.log(`    send-message (Envoyer un message)`);
  console.log(`     typing-start / typing-stop (Indicateur de saisie)`);
  console.log(`    friend-request-sent (Demande d'ami)`);
  console.log(`    join-livestream (Rejoindre un live)`);
  console.log(`    online-users (Liste des utilisateurs en ligne)`);
  console.log(`\n ROUTES AMIS (CORRIGÉES):`);
  console.log(`    GET    /api/friends`);
  console.log(`    GET    /api/friends/requests`);
  console.log(`    GET    /api/friends/suggestions`);
  console.log(`    POST   /api/friends/request`);
  console.log(`    PUT    /api/friends/accept/:friendshipId`);
  console.log(`    DELETE /api/friends/reject/:friendshipId`);
  console.log(`    DELETE /api/friends/remove/:friendId`);
  console.log(`    GET    /api/test/friends (Test routes)`);
  console.log(`\n ROUTES MESSAGES:`);
  console.log(`    GET  /api/messages/conversations`);
  console.log(`    GET  /api/messages/:friendId`);
  console.log(`    POST /api/messages`);
  console.log(`    GET  /api/messages/unread/count`);
  console.log(`\n THROWBACK AVEC SOCKET.IO EST PRÊT!\n`);
});

module.exports = { app, httpServer, io };