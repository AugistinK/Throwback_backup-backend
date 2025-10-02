// controllers/userProfileController.js
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const { updateProfileValidation } = require('../utils/authValidation');
const multer = require('multer');

/* =========================================================
   Multer en mémoire (pour stocker en MongoDB)
========================================================= */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, 
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Seules les images sont autorisées'), false);
  }
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

/* =========================================================
   Helpers
========================================================= */

/** Construit l'URL publique qui servira l'image depuis la BD */
const buildPhotoUrl = (req, userId) => {
  const base = (process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${base}/api/users/${userId}/photo`;
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

    // Respect confidentialité
    if (user.compte_prive && (!req.user || req.user.id !== user._id.toString())) {
      return res.status(403).json({ success: false, message: "Ce profil est privé" });
    }

    const out = user.toObject();

    // Si une image existe en BD, on fournit une URL de lecture
    out.photo_profil_url = (user.photo_profil && user.photo_profil.data)
      ? buildPhotoUrl(req, user._id)
      : null;

    // (si tu ajoutes plus tard photo_couverture en BD, fais la même chose)
    delete out.photo_profil; // on n'expose pas le binaire dans la réponse JSON

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
   PUT /api/users/profile   -> Mise à jour du profil (hors image)
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
      'preferences_notification'
      // NOTE: on n'accepte PAS photo_profil ici (gérée via endpoint dédié)
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

    // Log best-effort
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
    out.photo_profil_url = (user.photo_profil && user.photo_profil.data)
      ? buildPhotoUrl(req, user._id)
      : null;
    delete out.photo_profil;

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
   POST /api/users/profile/photo  -> Upload avatar (vers MongoDB)
========================================================= */
exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier n'a été uploadé" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    user.photo_profil = {
      data: req.file.buffer,          // binaire
      contentType: req.file.mimetype  // ex: image/jpeg
    };
    user.modified_date = Date.now();
    user.modified_by = req.user.id;

    await user.save();

    const out = user.toObject();
    out.photo_profil_url = buildPhotoUrl(req, user._id);
    delete out.photo_profil;

    return res.status(200).json({ success: true, message: "Photo de profil enregistrée en BD", data: out });
  } catch (error) {
    console.error('uploadProfilePhoto error:', error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de profil",
      error: error.message
    });
  }
};

/* =========================================================
   GET /api/users/:id/photo -> Lire l'image depuis MongoDB
========================================================= */
// Dans getProfilePhoto
exports.getProfilePhoto = async (req, res) => {
  try {
    console.log('📸 Demande de photo pour user:', req.params.id);
    
    const user = await User.findById(req.params.id).select('photo_profil');
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé:', req.params.id);
      return res.status(404).send('Utilisateur non trouvé');
    }
    
    if (!user.photo_profil || !user.photo_profil.data) {
      console.log('❌ Pas de photo pour user:', req.params.id);
      return res.status(404).send('Image non trouvée');
    }

    console.log('✅ Photo trouvée, type:', user.photo_profil.contentType);
    
    res.set('Content-Type', user.photo_profil.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800, must-revalidate');
    return res.send(user.photo_profil.data);
  } catch (error) {
    console.error('❌ getProfilePhoto error:', error);
    return res.status(500).send('Erreur lors de la récupération de l\'image');
  }
};

/* =========================================================
   DELETE /api/users/profile/photo -> Supprimer avatar
========================================================= */
exports.deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

    user.photo_profil = undefined; // rien à supprimer sur le disque
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    return res.status(200).json({ success: true, message: "Photo de profil supprimée avec succès" });
  } catch (error) {
    console.error('deleteProfilePhoto error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la suppression de la photo de profil" });
  }
};

/* =========================================================
   Settings de confidentialité (inchangé)
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
   Désactivation / suppression de compte (inchangé sauf fichiers)
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

    // Rien à supprimer sur le système de fichiers, on efface juste le doc
    await User.findByIdAndDelete(req.user.id);
    return res.status(200).json({ success: true, message: "Compte supprimé avec succès" });
  } catch (error) {
    console.error('deleteAccount error:', error);
    return res.status(500).json({ success: false, message: "Erreur lors de la suppression du compte" });
  }
};

/* =========================================================
   Exports middlewares (pour routes)
========================================================= */
exports.upload = uploadMemory;
exports.handleMulterError = handleMulterError;
exports.checkContentType = checkContentType;
