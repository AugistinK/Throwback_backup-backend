// middlewares/upload.middleware.js - VERSION CORRIGÉE
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/shorts');
    console.log('📁 Dossier d\'upload:', uploadDir);
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      console.log('📁 Création du dossier uploads/shorts');
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    console.log('📄 Fichier original:', file.originalname);
    
    // Générer un nom unique
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const randomNum = Math.round(Math.random() * 1E9);
    const filename = `short-${timestamp}-${randomNum}${ext}`;
    
    console.log('📄 Nom généré:', filename);
    cb(null, filename);
  }
});

// Filtre pour valider les types de fichiers
const fileFilter = (req, file, cb) => {
  console.log('🔍 Vérification du type de fichier:', file.mimetype);
  
  // Types de vidéo acceptés
  const allowedTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo', // AVI
    'video/webm'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    console.log('✅ Type de fichier accepté');
    cb(null, true);
  } else {
    console.log('❌ Type de fichier refusé');
    const error = new Error('Seuls les fichiers vidéo sont autorisés (MP4, AVI, MOV, WebM)');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// Limites de taille
const limits = {
  fileSize: 100 * 1024 * 1024, // 100MB max
  files: 1 // Un seul fichier à la fois
};

// Configuration Multer
const upload = multer({ 
  storage, 
  fileFilter, 
  limits 
});

// Middleware de gestion d'erreur personnalisé
const handleMulterError = (err, req, res, next) => {
  console.error('❌ Erreur Multer:', err);
  
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Le fichier est trop volumineux. Taille maximale: 100MB'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de fichiers. Un seul fichier autorisé.'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu. Utilisez le champ "videoFile".'
        });
      default:
        return res.status(400).json({
          success: false,
          message: `Erreur d'upload: ${err.message}`
        });
    }
  }
  
  // Erreurs personnalisées
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  // Autres erreurs
  console.error('❌ Erreur non Multer:', err);
  return res.status(500).json({
    success: false,
    message: 'Erreur interne lors de l\'upload'
  });
};

// Middleware de logging pour débuguer
const logUploadInfo = (req, res, next) => {
  console.log('📤 Upload middleware:');
  console.log('📋 Headers:', req.headers['content-type']);
  console.log('📋 Body keys:', Object.keys(req.body || {}));
  console.log('📁 File:', req.file ? 'Présent' : 'Absent');
  
  if (req.file) {
    console.log('📁 File info:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  }
  
  next();
};

module.exports = {
  upload,
  handleMulterError,
  logUploadInfo,
  single: (fieldName) => upload.single(fieldName),
  
  // Export direct pour compatibilité
  storage,
  fileFilter,
  limits
};