// middlewares/upload.post.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const createUploadDir = () => {
  const uploadDir = path.join(__dirname, '../uploads/posts');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Répertoire créé: ${uploadDir}`);
  }
  
  return uploadDir;
};

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
    
    const name = `post-${userId}-${timestamp}-${randomStr}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  // Types MIME acceptés - BEAUCOUP PLUS LARGES pour les posts
  const acceptedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif',
    'image/webp',
    'video/mp4', 
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav'
  ];
  
  if (!acceptedTypes.includes(file.mimetype)) {
    return cb(new Error('Format de fichier non supporté. Formats acceptés: JPG, PNG, GIF, WEBP, MP4, WebM, MOV, AVI, MP3, WAV'), false);
  }
  
  cb(null, true);
};

const limits = {
  fileSize: 50 * 1024 * 1024, // 50MB max
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
        message: "Le fichier est trop volumineux. Taille maximale: 50MB"
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

module.exports = {
  upload: upload.single('media'),
  handleMulterError
};