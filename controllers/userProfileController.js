const User = require('../models/User');
const LogAction = require('../models/LogAction');
const { updateProfileValidation } = require('../utils/authValidation');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

// Récupérer les chemins depuis .env
const UPLOAD_BASE_PATH = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');
const UPLOADS_URL = process.env.UPLOADS_URL || '/uploads';
const PROFILES_PATH = path.join(UPLOAD_BASE_PATH, 'profiles');

// Créer le dossier profiles s'il n'existe pas
if (!fs.existsSync(PROFILES_PATH)) {
  fs.mkdirSync(PROFILES_PATH, { recursive: true });
  console.log(' Dossier profiles créé:', PROFILES_PATH);
}

/**
 * Fonction helper pour supprimer un fichier
 */
const deleteMediaFile = (mediaPath) => {
  try {
    if (mediaPath.startsWith('/uploads')) {
      mediaPath = path.join(UPLOAD_BASE_PATH, mediaPath.replace('/uploads', ''));
    }
    if (fs.existsSync(mediaPath)) {
      fs.unlinkSync(mediaPath);
      console.log(' Fichier supprimé:', mediaPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(' Erreur suppression:', error);
    return false;
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId)
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    if (user.compte_prive && (!req.user || req.user.id !== user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: "Ce profil est privé"
      });
    }
    
    const backendUrl = process.env.BACKEND_URL || 'https://api.throwback-connect.com';
    
    if (user.photo_profil && !user.photo_profil.startsWith('http')) {
      user.photo_profil = `${backendUrl}${user.photo_profil}`;
    }
    
    if (user.photo_couverture && !user.photo_couverture.startsWith('http')) {
      user.photo_couverture = `${backendUrl}${user.photo_couverture}`;
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error(" Erreur récupération profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération du profil",
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { error } = updateProfileValidation(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    
    const updatableFields = [
      'nom', 'prenom', 'bio', 'date_naissance', 'genre',
      'pays', 'ville', 'adresse', 'code_postal', 'telephone',
      'profession', 'compte_prive', 'preferences_confidentialite',
      'preferences_notification', 'photo_profil'
    ];
    
    const updateData = {};
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'genre' && req.body[field]) {
          const genre = req.body[field].toUpperCase();
          if (['HOMME', 'FEMME', 'AUTRE'].includes(genre)) {
            updateData[field] = genre === 'HOMME' ? 'Homme' : 
                              genre === 'FEMME' ? 'Femme' : 'Autre';
          }
        } else {
          updateData[field] = req.body[field];
        }
      }
    });
    
    updateData.modified_date = Date.now();
    updateData.modified_by = req.user.id;
    
    const userBefore = await User.findById(req.user._id);
    if (!userBefore) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    let user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    )
    .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    const backendUrl = process.env.BACKEND_URL || 'https://api.throwback-connect.com';
    
    if (user.photo_profil && !user.photo_profil.startsWith('http')) {
      user.photo_profil = `${backendUrl}${user.photo_profil}`;
    }
    
    if (user.photo_couverture && !user.photo_couverture.startsWith('http')) {
      user.photo_couverture = `${backendUrl}${user.photo_couverture}`;
    }
    
    try {
      await LogAction.create({
        type_action: "PROFIL_MODIFIE",
        description_action: "Mise à jour du profil utilisateur",
        id_user: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: "SYSTEM"
      });
    } catch (logError) {
      console.error(" Erreur journalisation:", logError);
    }
    
    res.status(200).json({
      success: true,
      message: "Profil mis à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur mise à jour profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour du profil",
      error: error.message
    });
  }
};

// Configuration Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PROFILES_PATH);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    const filename = `user-${req.user.id}-${uniqueSuffix}${fileExt}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024,
    files: 1 
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: "Le fichier est trop volumineux. Taille maximale: 5MB"
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erreur lors de l'upload: ${err.message}`
    });
  }

  if (err.message === 'Unexpected end of form') {
    return res.status(400).json({
      success: false,
      message: "Le formulaire est incomplet"
    });
  }

  next(err);
};

const checkContentType = (req, res, next) => {
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      message: "Le Content-Type doit être multipart/form-data"
    });
  }
  next();
};

exports.upload = upload;
exports.handleMulterError = handleMulterError;
exports.checkContentType = checkContentType;

exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucun fichier n'a été uploadé"
      });
    }

    const backendUrl = process.env.BACKEND_URL || 'https://api.throwback-connect.com';
    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const fullPhotoUrl = `${backendUrl}${relativePath}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_profil: relativePath,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    user.photo_profil = fullPhotoUrl;

    res.status(200).json({
      success: true,
      message: "Photo de profil mise à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur upload photo profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de profil",
      error: error.message
    });
  }
};

exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucun fichier n'a été uploadé"
      });
    }

    const backendUrl = process.env.BACKEND_URL || 'https://api.throwback-connect.com';
    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const fullPhotoUrl = `${backendUrl}${relativePath}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_couverture: relativePath,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    user.photo_couverture = fullPhotoUrl;

    res.status(200).json({
      success: true,
      message: "Photo de couverture mise à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur upload photo couverture:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de couverture",
      error: error.message
    });
  }
};

exports.deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    if (user.photo_profil) {
      deleteMediaFile(user.photo_profil);
    }

    user.photo_profil = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Photo de profil supprimée avec succès"
    });
  } catch (error) {
    console.error(" Erreur suppression photo profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo de profil"
    });
  }
};

exports.deleteCoverPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    if (user.photo_couverture) {
      deleteMediaFile(user.photo_couverture);
    }

    user.photo_couverture = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Photo de couverture supprimée avec succès"
    });
  } catch (error) {
    console.error(" Erreur suppression photo couverture:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo de couverture"
    });
  }
};

exports.getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('compte_prive preferences_confidentialite');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    res.status(200).json({
      success: true,
      data: {
        compte_prive: user.compte_prive,
        preferences_confidentialite: user.preferences_confidentialite
      }
    });
  } catch (error) {
    console.error(" Erreur récupération paramètres:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue"
    });
  }
};

exports.updatePrivacySettings = async (req, res) => {
  try {
    const { compte_prive, preferences_confidentialite } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        compte_prive,
        preferences_confidentialite,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('compte_prive preferences_confidentialite');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    res.status(200).json({
      success: true,
      message: "Paramètres mis à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur mise à jour paramètres:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue"
    });
  }
};

exports.disableAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        compte_active: false,
        date_desactivation: Date.now(),
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    res.status(200).json({
      success: true,
      message: "Compte désactivé avec succès"
    });
  } catch (error) {
    console.error(" Erreur désactivation:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue"
    });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    if (user.photo_profil) {
      deleteMediaFile(user.photo_profil);
    }
    if (user.photo_couverture) {
      deleteMediaFile(user.photo_couverture);
    }

    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({
      success: true,
      message: "Compte supprimé avec succès"
    });
  } catch (error) {
    console.error(" Erreur suppression compte:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue"
    });
  }
};

module.exports = {
  ...exports,
  getUserProfile: exports.getUserProfile,
  updateProfile: exports.updateProfile,
  uploadProfilePhoto: exports.uploadProfilePhoto,
  uploadCoverPhoto: exports.uploadCoverPhoto,
  deleteProfilePhoto: exports.deleteProfilePhoto,
  deleteCoverPhoto: exports.deleteCoverPhoto,
  getPrivacySettings: exports.getPrivacySettings,
  updatePrivacySettings: exports.updatePrivacySettings,
  disableAccount: exports.disableAccount,
  deleteAccount: exports.deleteAccount
};