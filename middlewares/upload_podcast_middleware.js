// file_create: /home/claude/upload_podcast_middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');

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
    const randomStr = Math.random().toString(36).substring(2, 10);
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

// Middleware pour récupérer la thumbnail d'une vidéo
const fetchVideoThumbnail = async (req, res, next) => {
  // Seulement si un fichier n'a pas été uploadé et une URL vidéo est fournie
  if (req.file || !req.body.videoUrl) {
    return next();
  }

  try {
    // Analyser l'URL pour déterminer la plateforme
    const url = new URL(req.body.videoUrl);
    const hostname = url.hostname.toLowerCase();
    let videoId = null;
    let thumbnailUrl = null;

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      if (hostname.includes('youtu.be')) {
        videoId = url.pathname.substring(1);
      } else if (url.pathname.includes('/embed/')) {
        videoId = url.pathname.split('/embed/')[1];
      } else if (url.pathname.includes('/shorts/')) {
        videoId = url.pathname.split('/shorts/')[1];
      } else {
        videoId = url.searchParams.get('v');
      }
      
      if (videoId) {
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        // Télécharger et enregistrer la thumbnail
        const response = await axios({
          method: 'get',
          url: thumbnailUrl,
          responseType: 'arraybuffer'
        });

        const uploadDir = createUploadDir();
        const fileName = `yt-${videoId}-${Date.now()}.jpg`;
        const filePath = path.join(uploadDir, fileName);
        
        // Redimensionner et optimiser l'image
        await sharp(response.data)
          .resize(1280, 720, { fit: 'cover' })
          .jpeg({ quality: 90 })
          .toFile(filePath);
        
        // Ajouter le chemin de l'image au body
        req.body.coverImage = `/uploads/podcasts/${fileName}`;
        req.body.thumbnailUrl = thumbnailUrl;
      }
    }
    
    // Vimeo - nécessite un appel API
    else if (hostname.includes('vimeo.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      videoId = pathParts[0];
      
      if (videoId) {
        // Pour un usage réel, vous devriez utiliser l'API Vimeo
        // Mais pour la démo, on laisse null pour l'instant
        // Note: une API key Vimeo serait nécessaire
      }
    }
    
    // Dailymotion
    else if (hostname.includes('dailymotion.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      videoId = pathParts[pathParts.length - 1];
      if (videoId.includes('video/')) {
        videoId = videoId.split('video/')[1];
      }
      
      if (videoId) {
        thumbnailUrl = `https://www.dailymotion.com/thumbnail/video/${videoId}`;
        
        try {
          const response = await axios({
            method: 'get',
            url: thumbnailUrl,
            responseType: 'arraybuffer'
          });
  
          const uploadDir = createUploadDir();
          const fileName = `dm-${videoId}-${Date.now()}.jpg`;
          const filePath = path.join(uploadDir, fileName);
          
          await sharp(response.data)
            .resize(1280, 720, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toFile(filePath);
          
          req.body.coverImage = `/uploads/podcasts/${fileName}`;
          req.body.thumbnailUrl = thumbnailUrl;
        } catch (thumbnailError) {
          console.error('Error fetching Dailymotion thumbnail:', thumbnailError);
        }
      }
    }

    // Stocker l'ID et la plateforme dans le body
    if (videoId) {
      req.body.videoId = videoId;
      
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        req.body.platform = 'YOUTUBE';
      } else if (hostname.includes('vimeo.com')) {
        req.body.platform = 'VIMEO';
      } else if (hostname.includes('dailymotion.com')) {
        req.body.platform = 'DAILYMOTION';
      } else {
        req.body.platform = 'OTHER';
      }
    }
    
  } catch (error) {
    console.error('Error fetching video thumbnail:', error);
    // Continuer même si l'extraction échoue
  }
  
  next();
};

module.exports = {
  upload: upload.single('coverImage'),
  handleMulterError,
  fetchVideoThumbnail
};