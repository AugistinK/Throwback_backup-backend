// routes/api/userProfile.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');
const userProfileController = require('../../controllers/userProfileController');
const preferencesController = require('../../controllers/preferencesController');


// ——— routes "spécifiques" en premier ———
router.get('/profile/me',
  protect,
  (req, res) => res.redirect(`/api/users/${req.user.id}`)
);

router.put('/profile',
  protect,
  logAction('MODIFICATION_PROFIL','Mise à jour du profil'),
  userProfileController.updateProfile
);

router.post('/profile/photo',
  protect,
  userProfileController.checkContentType,
  userProfileController.upload.single('photo'),
  userProfileController.handleMulterError,
  logAction('UPLOAD_PHOTO_PROFIL','Upload photo profil'),
  userProfileController.uploadProfilePhoto
);

router.post('/profile/cover',
  protect,
  userProfileController.checkContentType,
  userProfileController.upload.single('photo'),
  userProfileController.handleMulterError,
  logAction('UPLOAD_PHOTO_COUVERTURE','Upload photo couverture'),
  userProfileController.uploadCoverPhoto
);

router.delete('/profile/photo',
  protect,
  logAction('SUPPRESSION_PHOTO_PROFIL','Suppression photo profil'),
  userProfileController.deleteProfilePhoto
);

router.delete('/profile/cover',
  protect,
  logAction('SUPPRESSION_PHOTO_COUVERTURE','Suppression photo couverture'),
  userProfileController.deleteCoverPhoto
);

router.get('/profile/privacy',
  protect,
  userProfileController.getPrivacySettings
);

router.put('/profile/privacy',
  protect,
  logAction('MISE_A_JOUR_CONFIDENTIALITE','Mise à jour confidentialité'),
  userProfileController.updatePrivacySettings
);

router.put('/profile/disable',
  protect,
  logAction('DESACTIVATION_COMPTE','Désactivation compte'),
  userProfileController.disableAccount
);

router.delete('/profile',
  protect,
  logAction('SUPPRESSION_COMPTE','Suppression compte'),
  userProfileController.deleteAccount
);

router.get('/preferences',
  protect,
  preferencesController.getPreferences
);

router.put('/preferences',
  protect,
  logAction('MISE_A_JOUR_PREFERENCES','Mise à jour des préférences'),
  preferencesController.updatePreferences
);
// … tes autres routes `/settings`, `/change-password`, etc …  

// ——— route "catch-all" en dernier ———
router.get('/:id',
  userProfileController.getUserProfile
);

module.exports = router;
