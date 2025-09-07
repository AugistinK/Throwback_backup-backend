const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const createUploadDir = () => {
  const uploadDir = path.join(__dirname, '../uploads/shorts');
  
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
    // Générer un nom de fichier unique pour éviter les collisions
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(file.originalname).toLowerCase();
    
    const name = `short-${userId}-${timestamp}-${randomStr}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  // Définir les types MIME vidéo acceptés
  const acceptedTypes = [
    'video/mp4', 
    'video/webm', 
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];
  
  if (!acceptedTypes.includes(file.mimetype)) {
    return cb(new Error('Format de vidéo non supporté. Formats acceptés: MP4, WebM, MOV, AVI, MKV'), false);
  }
  
  cb(null, true);
};

const limits = {
  fileSize: 100 * 1024 * 1024, // 100MB max pour les shorts
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
        message: "Le fichier est trop volumineux. Taille maximale: 100MB"
      });
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez télécharger qu'un seul fichier à la fois."
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

// Exporter le middleware complet avec gestion d'erreurs
module.exports = {
  upload: upload.single('videoFile'),
  handleMulterError
};

// Pour rétrocompatibilité avec l'ancien code
module.exports.default = upload;