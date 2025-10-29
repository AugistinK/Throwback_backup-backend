// file_create: /home/claude/upload_podcast_middleware_minimal.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const createUploadDir = () => {
  const uploadDir = path.join(__dirname, '../uploads/podcasts');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Répertoire créé: ${uploadDir}`);
  }
  
  return uploadDir;
};

// Configuration du stockage pour multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = createUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Générer un nom de fichier unique
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const randomStr = Math.round(Math.random() * 1000000);
    const ext = path.extname(file.originalname).toLowerCase();
    
    const name = `podcast-${userId}-${timestamp}-${randomStr}${ext}`;
    cb(null, name);
  }
});

// Filtre de fichiers
const fileFilter = (req, file, cb) => {
  // Types MIME acceptés pour les images
  const acceptedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/webp',
    'image/gif'
  ];
  
  if (!acceptedTypes.includes(file.mimetype)) {
    return cb(new Error('Format de fichier non supporté. Formats acceptés: JPG, PNG, WEBP, GIF'), false);
  }
  
  cb(null, true);
};

// Limites
const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB max
  files: 1
};

// Middleware d'upload avec gestion des erreurs intégrée
const upload = multer({ 
  storage, 
  fileFilter, 
  limits 
});

// Middleware pour gérer les erreurs de multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erreurs spécifiques à Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: "Le fichier est trop volumineux. Taille maximale: 5MB"
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Erreur lors du téléchargement: ${err.message}`
      });
    }
  } else if (err) {
    // Autres erreurs
    return res.status(400).json({
      success: false,
      message: err.message || "Une erreur est survenue lors du téléchargement."
      });
  }
  
  next();
};

// Middleware basique pour extraire la plateforme et l'ID vidéo
const extractVideoInfo = (req, res, next) => {
  // Seulement si une URL vidéo est fournie
  if (!req.body.videoUrl) {
    return next();
  }

  try {
    // Extraction simple sans utiliser URL (pour éviter les problèmes de compatibilité)
    const videoUrl = req.body.videoUrl;
    
    // YouTube
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      let videoId = null;
      
      if (videoUrl.includes('youtu.be/')) {
        const parts = videoUrl.split('youtu.be/');
        videoId = parts[1] ? parts[1].split('?')[0].split('&')[0] : null;
      } else if (videoUrl.includes('/embed/')) {
        const parts = videoUrl.split('/embed/');
        videoId = parts[1] ? parts[1].split('?')[0].split('&')[0] : null;
      } else if (videoUrl.includes('/shorts/')) {
        const parts = videoUrl.split('/shorts/');
        videoId = parts[1] ? parts[1].split('?')[0].split('&')[0] : null;
      } else if (videoUrl.includes('v=')) {
        const parts = videoUrl.split('v=');
        videoId = parts[1] ? parts[1].split('&')[0] : null;
      }
      
      if (videoId) {
        req.body.videoId = videoId;
        req.body.platform = 'YOUTUBE';
      }
    }
    
    // Vimeo
    else if (videoUrl.includes('vimeo.com')) {
      const regex = /vimeo\.com\/([0-9]+)/;
      const match = videoUrl.match(regex);
      
      if (match && match[1]) {
        req.body.videoId = match[1];
        req.body.platform = 'VIMEO';
      }
    }
    
    // Dailymotion
    else if (videoUrl.includes('dailymotion.com')) {
      const regex = /dailymotion\.com\/(?:video\/|embed\/video\/|)([a-zA-Z0-9]+)/;
      const match = videoUrl.match(regex);
      
      if (match && match[1]) {
        req.body.videoId = match[1];
        req.body.platform = 'DAILYMOTION';
      }
    }
    
  } catch (error) {
    console.error('Error extracting video info:', error);
    // Continuer même si l'extraction échoue
  }
  
  next();
};

module.exports = {
  upload: upload.single('coverImage'),
  handleMulterError,
  extractVideoInfo
};