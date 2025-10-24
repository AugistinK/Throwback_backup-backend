const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Fonction pour générer l'URL complète d'un fichier de profil
const getProfilePhotoUrl = (filename) => {
  const baseUrl = process.env.UPLOADS_URL || 'http://localhost:5000/uploads';
  return `${baseUrl}/profiles/${filename}`;
};

// Configure multer storage for user profile images
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Utiliser la variable d'environnement pour le chemin de base
    const baseUploadDir = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');
    const uploadDir = path.join(baseUploadDir, 'profiles');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`Created profiles directory: ${uploadDir}`);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, `user-${req.params.id || req.user.id}-${uniqueSuffix}${fileExt}`);
  }
});

// File filter to allow only images
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Create multer upload middleware
const profileUpload = multer({
  storage: profileStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// API: Upload profile photo
exports.uploadProfilePhoto = async (req, res) => {
  try {
    const upload = profileUpload.single('photo');
    
    upload(req, res, async function(err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ 
          success: false, 
          message: `Error uploading file: ${err.message}` 
        });
      } else if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: "No file uploaded" 
        });
      }
      
      const userId = req.params.id || req.user.id;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }
      
      // Delete old photo if it exists
      if (user.photo_profil && !user.photo_profil.startsWith('http')) {
        // Si le chemin est relatif, construire le chemin absolu
        const oldPhotoPath = user.photo_profil.startsWith('/uploads')
          ? path.join(process.env.UPLOAD_PATH || path.join(__dirname, '..'), user.photo_profil.replace('/uploads', ''))
          : path.join(__dirname, '..', user.photo_profil);
          
        if (fs.existsSync(oldPhotoPath)) {
          console.log(`Deleting old profile photo: ${oldPhotoPath}`);
          fs.unlinkSync(oldPhotoPath);
        }
      }
      
      // Générer le chemin relatif pour la BDD
      const relativePhotoPath = `/profiles/${req.file.filename}`;
      
      // Update user with new photo path and generate full URL for response
      user.photo_profil = relativePhotoPath; // Sauvegarder le chemin relatif
      user.modified_date = Date.now();
      user.modified_by = req.user.id;
      await user.save();
      
      // Générer l'URL complète pour la réponse
      const photoUrl = getProfilePhotoUrl(req.file.filename);
      
      // Log action
      await LogAction.create({
        type_action: "UPLOAD_PHOTO_PROFIL",
        description_action: "Upload d'une nouvelle photo de profil",
        id_user: userId,
        created_by: req.user.id
      });
      
      res.json({
        success: true,
        message: "Profile photo uploaded successfully",
        photo_profil: relativePhotoPath,
        photo_url: photoUrl // Ajouter l'URL complète dans la réponse
      });
    });
  } catch (error) {
    console.error("Error uploading profile photo:", error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while uploading profile photo." 
    });
  }
};

// Exporter également la fonction d'URL et le middleware
exports.getProfilePhotoUrl = getProfilePhotoUrl;
exports.profileUpload = profileUpload;