const User = require('../models/User');
const LogAction = require('../models/LogAction');
const { updateProfileValidation } = require('../utils/authValidation');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

/* =========================================================
   Helpers
========================================================= */

/** Construit une URL publique absolue à partir d’un chemin relatif.
 *  Utilise BACKEND_URL si défini, sinon dérive depuis la requête.
 *  Ne JAMAIS modifier ce qui est stocké en BD (on ne renvoie l’URL
 *  absolue que dans la réponse).
 */
const buildPublicUrl = (req, relativePath) => {
  if (!relativePath) return null;
  if (typeof relativePath !== 'string') return null;
  if (relativePath.startsWith('http')) return relativePath;

  const base = (process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${rel}`;
};

/* =========================================================
   GET /api/users/:id   -> Profil utilisateur
========================================================= */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Identifiant d'utilisateur invalide" });
    }

    const user = await User.findById(userId)
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }

    // Respect de la confidentialité
    if (user.compte_prive && (!req.user || req.user.id !== user._id.toString())) {
      return res.status(403).json({ success: false, message: "Ce profil est privé" });
    }

    // Préparer la sortie sans modifier la BD
    const out = user.toObject();
    out.photo_profil = buildPublicUrl(req, out.photo_profil);
    out.photo_couverture = buildPublicUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, data: out });
  } catch (error) {
    console.error('getUserProfile error:', error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération du profil",
      error: error.message
    });
  }
};

/* =========================================================
   PUT /api/users/profile   -> Mise à jour du profil
========================================================= */
exports.updateProfile = async (req, res) => {
  try {
    const { error } = updateProfileValidation(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
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
          const g = String(req.body[field]).toUpperCase();
          if (['HOMME', 'FEMME', 'AUTRE'].includes(g)) {
            updateData[field] = g === 'HOMME' ? 'Homme' : (g === 'FEMME' ? 'Femme' : 'Autre');
          }
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    // Si on nous a envoyé une URL absolue pour photo_profil, on n’en garde que le chemin
    if (typeof updateData.photo_profil === 'string' && updateData.photo_profil.startsWith('http')) {
      try {
        const u = new URL(updateData.photo_profil);
        updateData.photo_profil = u.pathname;
      } catch { /* on ignore si ce n’est pas une URL valide */ }
    }

    updateData.modified_date = Date.now();
    updateData.modified_by = req.user.id;

    const exists = await User.findById(req.user._id);
    if (!exists) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true, context: 'query' }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    // Log (best-effort)
    try {
      await LogAction.create({
        type_action: "PROFIL_MODIFIE",
        description_action: "Mise à jour du profil utilisateur",
        id_user: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: "SYSTEM"
      });
    } catch (e) {
      console.warn('LogAction failed:', e.message);
    }

    const out = user.toObject();
    out.photo_profil = buildPublicUrl(req, out.photo_profil);
    out.photo_couverture = buildPublicUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: "Profil mis à jour avec succès", data: out });
  } catch (error) {
    console.error('updateProfile error:', error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour du profil",
      error: error.message
    });
  }
};

/* =========================================================
   Multer (images de profil & couverture)
========================================================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `user-${req.user.id}-${suffix}${ext}`;
    cb(null, name);
  }
});

const imageFileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
  return cb(new Error('Seules les images sont autorisées'), false);
};

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 } // 5MB
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: "Le fichier est trop volumineux. Taille maximale: 5MB" });
    }
    return res.status(400).json({ success: false, message: `Erreur lors de l'upload: ${err.message}` });
  }
  if (err) return res.status(400).json({ success: false, message: err.message || "Erreur d'upload" });
  return next();
};

const checkContentType = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) {
    return res.status(400).json({ success: false, message: "Le Content-Type doit être multipart/form-data" });
  }
  next();
};

// On exporte ces middlewares pour les routes
exports.upload = upload;
exports.handleMulterError = handleMulterError;
exports.checkContentType = checkContentType;

/* =========================================================
   POST /api/users/profile/photo      -> Upload avatar
   POST /api/users/profile/cover      -> Upload couverture
   (usage conseillé en route: checkContentType, upload.single('photo'), handleMulterError, uploadProfilePhoto|uploadCoverPhoto)
========================================================= */
exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier n'a été uploadé" });

    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo_profil: relativePath, modified_date: Date.now(), modified_by: req.user.id },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    const out = user.toObject();
    out.photo_profil = buildPublicUrl(req, out.photo_profil);
    out.photo_couverture = buildPublicUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: "Photo de profil mise à jour avec succès", data: out });
  } catch (error) {
    console.error('uploadProfilePhoto error:', error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de profil",
      error: error.message
    });
  }
};

exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier n'a été uploadé" });

    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo_couverture: relativePath, modified_date: Date.now(), modified_by: req.user.id },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    const out = user.toObject();
    out.photo_profil = buildPublicUrl(req, out.photo_profil);
    out.photo_couverture = buildPublicUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: "Photo de couverture mise à jour avec succès", data: out });
  } catch (error) {
    console.error('uploadCoverPhoto error:', error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de couverture",
      error: error.message
    });
  }
};

/* =========================================================
   DELETE /api/users/profile/photo    -> Supprimer avatar
   DELETE /api/users/profile/cover    -> Supprimer couverture
========================================================= */
exports.deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    if (user.photo_profil) {
      const oldPath = path.join(__dirname, '..', user.photo_profil);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    user.photo_profil = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    return res.status(200).json({ success: true, message: "Photo de profil supprimée avec succès" });
  } catch (error) {
    console.error('deleteProfilePhoto error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la suppression de la photo de profil" });
  }
};

exports.deleteCoverPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    if (user.photo_couverture) {
      const oldPath = path.join(__dirname, '..', user.photo_couverture);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    user.photo_couverture = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    return res.status(200).json({ success: true, message: "Photo de couverture supprimée avec succès" });
  } catch (error) {
    console.error('deleteCoverPhoto error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la suppression de la photo de couverture" });
  }
};

/* =========================================================
   GET/PUT privacy
========================================================= */
exports.getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('compte_prive preferences_confidentialite');
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    return res.status(200).json({
      success: true,
      data: {
        compte_prive: user.compte_prive,
        preferences_confidentialite: user.preferences_confidentialite
      }
    });
  } catch (error) {
    console.error('getPrivacySettings error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la récupération des paramètres de confidentialité" });
  }
};

exports.updatePrivacySettings = async (req, res) => {
  try {
    const { compte_prive, preferences_confidentialite } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { compte_prive, preferences_confidentialite, modified_date: Date.now(), modified_by: req.user.id },
      { new: true }
    ).select('compte_prive preferences_confidentialite');

    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    return res.status(200).json({ success: true, message: "Paramètres de confidentialité mis à jour", data: user });
  } catch (error) {
    console.error('updatePrivacySettings error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la mise à jour des paramètres de confidentialité" });
  }
};

/* =========================================================
   Désactivation / suppression de compte
========================================================= */
exports.disableAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { compte_active: false, date_desactivation: Date.now(), modified_date: Date.now(), modified_by: req.user.id },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    return res.status(200).json({ success: true, message: "Compte désactivé avec succès" });
  } catch (error) {
    console.error('disableAccount error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la désactivation du compte" });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    if (user.photo_profil) {
      const p = path.join(__dirname, '..', user.photo_profil);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (user.photo_couverture) {
      const p = path.join(__dirname, '..', user.photo_couverture);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    await User.findByIdAndDelete(req.user.id);
    return res.status(200).json({ success: true, message: "Compte supprimé avec succès" });
  } catch (error) {
    console.error('deleteAccount error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la suppression du compte" });
  }
};

/* =========================================================
   Exports explicites (optionnel)
========================================================= */
module.exports = {
  ...exports,
  getUserProfile: exports.getUserProfile,
  updateProfile: exports.updateProfile,
  upload,               
  handleMulterError,    
  checkContentType,    
  uploadProfilePhoto: exports.uploadProfilePhoto,
  uploadCoverPhoto: exports.uploadCoverPhoto,
  deleteProfilePhoto: exports.deleteProfilePhoto,
  deleteCoverPhoto: exports.deleteCoverPhoto,
  getPrivacySettings: exports.getPrivacySettings,
  updatePrivacySettings: exports.updatePrivacySettings,
  disableAccount: exports.disableAccount,
  deleteAccount: exports.deleteAccount
};
