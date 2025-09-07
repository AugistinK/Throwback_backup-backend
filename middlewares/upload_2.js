
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer storage for user profile images
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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
        const oldPhotoPath = path.join(__dirname, '..', user.photo_profil);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      
      // Update user with new photo path
      user.photo_profil = `/uploads/profiles/${req.file.filename}`;
      user.modified_date = Date.now();
      user.modified_by = req.user.id;
      await user.save();
      
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
        photo_profil: user.photo_profil
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