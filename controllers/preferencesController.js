// controllers/preferencesController.js
const Preferences = require('../models/Preferences');
const User = require('../models/User');
const LogAction = require('../models/LogAction');

/**
 * @desc    Récupérer les préférences d'un utilisateur
 * @route   GET /api/users/preferences
 * @access  Private
 */
exports.getPreferences = async (req, res) => {
  try {
    // Chercher les préférences existantes
    let preferences = await Preferences.findOne({ userId: req.user.id });
    
    // Si aucune préférence n'existe, créer un enregistrement par défaut
    if (!preferences) {
      preferences = await Preferences.create({
        userId: req.user.id,
        created_by: req.user.id
      });
    }
    
    res.status(200).json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des préférences:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des préférences"
    });
  }
};

/**
 * @desc    Mettre à jour les préférences d'un utilisateur
 * @route   PUT /api/users/preferences
 * @access  Private
 */
exports.updatePreferences = async (req, res) => {
  try {
    const updatedFields = req.body;
    
    // Vérifier si l'enregistrement de préférences existe
    let preferences = await Preferences.findOne({ userId: req.user.id });
    
    if (!preferences) {
      // Créer un nouvel enregistrement avec les valeurs fournies
      preferences = await Preferences.create({
        userId: req.user.id,
        ...updatedFields,
        created_by: req.user.id,
        modified_by: req.user.id
      });
    } else {
      // Mettre à jour les champs fournis
      Object.keys(updatedFields).forEach(key => {
        preferences[key] = updatedFields[key];
      });
      
      preferences.modified_by = req.user.id;
      preferences.modified_date = Date.now();
      await preferences.save();
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "PREFERENCES_MODIFIEES",
      description_action: "Mise à jour des préférences utilisateur",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: req.user.id
    });
    
    res.status(200).json({
      success: true,
      message: "Préférences mises à jour avec succès",
      data: preferences
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des préférences:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour des préférences"
    });
  }
};