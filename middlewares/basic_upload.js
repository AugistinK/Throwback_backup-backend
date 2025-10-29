//basic_upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Répertoire d'upload
const createUploadDir = () => {
  const uploadDir = path.join(__dirname, '../uploads/podcasts');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Configuration multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, createUploadDir());
  },
  filename: (req, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 10000);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `podcast-${userId}-${timestamp}-${random}${ext}`);
  }
});

// Configuration upload
const uploadConfig = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.mimetype)) {
      return cb(new Error('Format non supporté (JPG, PNG, GIF, WEBP)'), false);
    }
    cb(null, true);
  }
});

// Fonction simple d'extraction info vidéo
const extractVideoInfo = (req, res, next) => {
  if (req.body.videoUrl) {
    const url = req.body.videoUrl;
    
    if (url.includes('youtube') || url.includes('youtu.be')) {
      req.body.platform = 'YOUTUBE';
    } else if (url.includes('vimeo')) {
      req.body.platform = 'VIMEO';
    } else if (url.includes('dailymotion')) {
      req.body.platform = 'DAILYMOTION';
    } else {
      req.body.platform = 'OTHER';
    }
  }
  next();
};

// Gestionnaire d'erreurs
const handleUploadError = (err, req, res, next) => {
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Erreur lors de l\'upload'
    });
  }
  next();
};

module.exports = {
  upload: uploadConfig.single('coverImage'),
  handleError: handleUploadError,
  processVideo: extractVideoInfo
};