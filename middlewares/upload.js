// middlewares/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// CrÃ©er le rÃ©pertoire de destination s'il n'existe pas
const createUploadDir = () => {
  const uploadDir = path.join(__dirname, '../uploads/shorts');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`RÃ©pertoire crÃ©Ã©: ${uploadDir}`);
  }
  
  return uploadDir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = createUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // GÃ©nÃ©rer un nom de fichier unique pour Ã©viter les collisions
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const ext = path.extname(file.originalname).toLowerCase();
    
    const name = `short-${userId}-${timestamp}-${randomStr}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  // DÃ©finir les types MIME vidÃ©o acceptÃ©s
  const acceptedTypes = [
    'video/mp4', 
    'video/webm', 
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];
  
  if (!acceptedTypes.includes(file.mimetype)) {
    return cb(new Error('Format de vidÃ©o non supportÃ©. Formats acceptÃ©s: MP4, WebM, MOV, AVI, MKV'), false);
  }
  
  cb(null, true);
};

const limits = {
  fileSize: 100 * 1024 * 1024, // 100MB max pour les shorts
  files: 1
};

// Middleware d'upload avec gestion des erreurs intÃ©grÃ©e
const upload = multer({ 
  storage, 
  fileFilter, 
  limits 
});

// Middleware pour gÃ©rer les erreurs de multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erreurs spÃ©cifiques Ã  Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: "Le fichier est trop volumineux. Taille maximale: 100MB"
      });
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez tÃ©lÃ©charger qu'un seul fichier Ã  la fois."
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Erreur lors du tÃ©lÃ©chargement: ${err.message}`
      });
    }
  } else if (err) {
    // Autres erreurs
    return res.status(400).json({
      success: false,
      message: err.message || "Une erreur est survenue lors du tÃ©lÃ©chargement."
    });
  }
  
  next();
};

// Exporter le middleware complet avec gestion d'erreurs
module.exports = {
  upload: upload.single('videoFile'),
  handleMulterError
};


module.exports.default = upload;