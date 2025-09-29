const User = require('../models/User');
const LogAction = require('../models/LogAction');
const { updateProfileValidation } = require('../utils/authValidation');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

/* --------------------------------- Helpers -------------------------------- */

/** Construit une URL absolue à partir d’un chemin relatif stocké en BDD */
const buildAssetUrl = (req, maybePath) => {
  if (!maybePath || typeof maybePath !== 'string') return maybePath;
  if (maybePath.startsWith('http://') || maybePath.startsWith('https://')) return maybePath;

  const base =
    (process.env.BACKEND_URL && process.env.BACKEND_URL.replace(/\/+$/, '')) ||
    `${req.protocol}://${req.get('host')}`;
  const rel = maybePath.startsWith('/') ? maybePath : `/${maybePath}`;
  return `${base}${rel}`;
};

/** Convertit un chemin web relatif en chemin local absolu sûr pour fs.* */
const toLocalPath = (relativeWebPath) => {
  const clean = String(relativeWebPath || '').replace(/^\//, '');
  return path.join(__dirname, '..', clean);
};

const unlinkSafe = (absPath) => {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (e) {
    console.warn('unlinkSafe error:', e.message);
  }
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/* -------------------------- Multer configuration -------------------------- */
/** Destination dynamique: `/uploads/profiles` ou `/uploads/covers` */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // On déduit le sous-dossier depuis l'URL de la route
    const sub = /\/cover\b/i.test(req.originalUrl) ? 'covers' : 'profiles';
    const uploadDir = path.join(__dirname, `../uploads/${sub}`);
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const userId = (req.user && (req.user.id || req.user._id)) || 'anon';
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `user-${userId}-${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
  return cb(new Error('Seules les images sont autorisées'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 } // 5MB
});

const handleMulterError = (err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Le fichier est trop volumineux. Taille maximale: 5MB' });
    }
    return res.status(400).json({ success: false, message: `Erreur lors de l'upload: ${err.message}` });
  }
  if (err.message === 'Unexpected end of form') {
    return res.status(400).json({
      success: false,
      message:
        "Le formulaire est incomplet. Assurez-vous d'envoyer le fichier avec le champ 'photo' en utilisant multipart/form-data"
    });
  }
  return res.status(400).json({ success: false, message: err.message || 'Upload échoué' });
};

const checkContentType = (req, res, next) => {
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
    return res.status(400).json({ success: false, message: 'Le Content-Type doit être multipart/form-data' });
  }
  next();
};

/* ------------------------------- Controllers ------------------------------ */

/**
 * @desc    Récupérer le profil d'un utilisateur
 * @route   GET /api/users/:id
 * @access  Private/Public selon les paramètres de confidentialité
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    // lean() => objet JS (évite de muter le doc Mongoose)
    const user = await User.findById(userId)
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Vérifier la confidentialité
    if (user.compte_prive && (!req.user || String(req.user.id) !== String(user._id))) {
      return res.status(403).json({ success: false, message: 'Ce profil est privé' });
    }

    // “Habiller” les chemins en URLs absolues uniquement dans la réponse
    user.photo_profil = buildAssetUrl(req, user.photo_profil);
    user.photo_couverture = buildAssetUrl(req, user.photo_couverture);

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération du profil',
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour le profil utilisateur
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const { error } = updateProfileValidation(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details?.[0]?.message || 'Données invalides' });
    }

    const updatableFields = [
      'nom',
      'prenom',
      'bio',
      'date_naissance',
      'genre',
      'pays',
      'ville',
      'adresse',
      'code_postal',
      'telephone',
      'profession',
      'compte_prive',
      'preferences_confidentialite',
      'preferences_notification',
      'photo_profil' // si tu souhaites l’autoriser via une URL (sinon retire)
    ];

    const updateData = {};
    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        if (field === 'genre' && req.body[field]) {
          const g = String(req.body[field]).toUpperCase();
          if (['HOMME', 'FEMME', 'AUTRE'].includes(g)) {
            updateData[field] = g === 'HOMME' ? 'Homme' : g === 'FEMME' ? 'Femme' : 'Autre';
          }
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    updateData.modified_date = new Date();
    updateData.modified_by = req.user.id;

    const exists = await User.findById(req.user._id).select('_id');
    if (!exists) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    const user = await User.findOneAndUpdate({ _id: req.user._id }, { $set: updateData }, { new: true, runValidators: true, context: 'query' })
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    try {
      await LogAction.create({
        type_action: 'PROFIL_MODIFIE',
        description_action: 'Mise à jour du profil utilisateur',
        id_user: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: 'SYSTEM'
      });
    } catch (e) {
      console.warn('LogAction error:', e.message);
    }

    const out = user.toObject();
    out.photo_profil = buildAssetUrl(req, out.photo_profil);
    out.photo_couverture = buildAssetUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: 'Profil mis à jour avec succès', data: out });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour du profil',
      error: error.message
    });
  }
};

/**
 * @desc    Upload photo de profil
 * @route   POST /api/users/profile/photo
 * @access  Private
 * Champ fichier: "photo"
 */
const uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier n'a été uploadé" });

    const relativePath = `/uploads/profiles/${req.file.filename}`;

    // Supprimer l’ancienne photo si présente
    const current = await User.findById(req.user.id).select('photo_profil');
    if (!current) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (current.photo_profil) unlinkSafe(toLocalPath(current.photo_profil));

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo_profil: relativePath, modified_date: new Date(), modified_by: req.user.id },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    const out = user.toObject();
    out.photo_profil = buildAssetUrl(req, out.photo_profil);
    out.photo_couverture = buildAssetUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: 'Photo de profil mise à jour avec succès', data: out });
  } catch (error) {
    console.error("Erreur lors de l'upload de la photo de profil:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de profil",
      error: error.message
    });
  }
};

/**
 * @desc    Upload photo de couverture
 * @route   POST /api/users/profile/cover
 * @access  Private
 * Champ fichier: "photo"
 */
const uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier n'a été uploadé" });

    const relativePath = `/uploads/covers/${req.file.filename}`;

    // Supprimer l’ancienne couverture si présente
    const current = await User.findById(req.user.id).select('photo_couverture');
    if (!current) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (current.photo_couverture) unlinkSafe(toLocalPath(current.photo_couverture));

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo_couverture: relativePath, modified_date: new Date(), modified_by: req.user.id },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    const out = user.toObject();
    out.photo_profil = buildAssetUrl(req, out.photo_profil);
    out.photo_couverture = buildAssetUrl(req, out.photo_couverture);

    return res.status(200).json({ success: true, message: 'Photo de couverture mise à jour avec succès', data: out });
  } catch (error) {
    console.error("Erreur lors de l'upload de la photo de couverture:", error);
    return res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de couverture",
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer la photo de profil
 * @route   DELETE /api/users/profile/photo
 * @access  Private
 */
const deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('photo_profil');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (user.photo_profil) unlinkSafe(toLocalPath(user.photo_profil));

    await User.findByIdAndUpdate(req.user.id, {
      photo_profil: null,
      modified_date: new Date(),
      modified_by: req.user.id
    });

    return res.status(200).json({ success: true, message: 'Photo de profil supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la photo de profil:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression de la photo de profil'
    });
  }
};

/**
 * @desc    Supprimer la photo de couverture
 * @route   DELETE /api/users/profile/cover
 * @access  Private
 */
const deleteCoverPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('photo_couverture');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (user.photo_couverture) unlinkSafe(toLocalPath(user.photo_couverture));

    await User.findByIdAndUpdate(req.user.id, {
      photo_couverture: null,
      modified_date: new Date(),
      modified_by: req.user.id
    });

    return res.status(200).json({ success: true, message: 'Photo de couverture supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la photo de couverture:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression de la photo de couverture'
    });
  }
};

/**
 * @desc    Récupérer les paramètres de confidentialité
 * @route   GET /api/users/profile/privacy
 * @access  Private
 */
const getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('compte_prive preferences_confidentialite');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    return res.status(200).json({
      success: true,
      data: { compte_prive: user.compte_prive, preferences_confidentialite: user.preferences_confidentialite }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres de confidentialité:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des paramètres de confidentialité'
    });
  }
};

/**
 * @desc    Mettre à jour les paramètres de confidentialité
 * @route   PUT /api/users/profile/privacy
 * @access  Private
 */
const updatePrivacySettings = async (req, res) => {
  try {
    const { compte_prive, preferences_confidentialite } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { compte_prive, preferences_confidentialite, modified_date: new Date(), modified_by: req.user.id },
      { new: true }
    ).select('compte_prive preferences_confidentialite');

    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    return res.status(200).json({
      success: true,
      message: 'Paramètres de confidentialité mis à jour avec succès',
      data: user
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres de confidentialité:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la mise à jour des paramètres de confidentialité'
    });
  }
};

/**
 * @desc    Désactiver le compte
 * @route   PUT /api/users/profile/disable
 * @access  Private
 */
const disableAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { compte_active: false, date_desactivation: new Date(), modified_date: new Date(), modified_by: req.user.id },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    return res.status(200).json({ success: true, message: 'Compte désactivé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la désactivation du compte:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la désactivation du compte'
    });
  }
};

/**
 * @desc    Supprimer le compte
 * @route   DELETE /api/users/profile
 * @access  Private
 */
const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    // Supprimer les fichiers éventuels
    if (user.photo_profil) unlinkSafe(toLocalPath(user.photo_profil));
    if (user.photo_couverture) unlinkSafe(toLocalPath(user.photo_couverture));

    await User.findByIdAndDelete(req.user.id);
    return res.status(200).json({ success: true, message: 'Compte supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du compte'
    });
  }
};

/* --------------------------------- Exports -------------------------------- */

module.exports = {
  // middlewares upload
  upload,
  handleMulterError,
  checkContentType,
  getUserProfile,
  updateProfile,
  uploadProfilePhoto,
  uploadCoverPhoto,
  deleteProfilePhoto,
  deleteCoverPhoto,
  getPrivacySettings,
  updatePrivacySettings,
  disableAccount,
  deleteAccount
};
