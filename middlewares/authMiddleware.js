const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// Middleware de protection amélioré avec logs de débogage
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided.' 
      });
    }
    
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log("🔐 Token decoded:", { id: decoded.id, email: decoded.email });

    // Récupère l'utilisateur complet
    const user = await User.findById(decoded.id).select('+mot_de_passe'); // Inclure tous les champs
    
    if (!user) {
      console.log(" User not found for ID:", decoded.id);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. User not found.' 
      });
    }

    console.log(" User found:", {
      _id: user._id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role
    });

    //  Expose l'utilisateur avec TOUTES les propriétés nécessaires
    req.user = {
      id: user._id.toString(), //  ID en string pour comparaison
      _id: user._id, //  ObjectId original
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role, //  Rôle simple
      roles: user.roles || [], //  Tableau de rôles (si existe)
      photo_profil: user.photo_profil,
      statut_compte: user.statut_compte,
      statut_verification: user.statut_verification
    };

    console.log(" req.user exposé:", {
      id: req.user.id,
      _id: req.user._id,
      role: req.user.role
    });

    next();
  } catch (err) {
    console.error(' Auth middleware error:', err);
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Invalid token.' 
    });
  }
};

// Middleware d'autorisation simplifié - vérifie le rôle unique
exports.authorize = (...roles) => (req, res, next) => {
  console.log(" Authorize check:", {
    userRole: req.user?.role,
    requiredRoles: roles
  });
  
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden' 
    });
  }
  next();
};

// Middleware pour vérifier si l'utilisateur est un administrateur
exports.isAdmin = async (req, res, next) => {
  try {
    console.log(" isAdmin check for user:", req.user?.id);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    console.log(" User role:", user?.role);
    
    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits d\'administrateur requis.'
      });
    }

    next();
  } catch (error) {
    console.error(' Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des droits d\'administrateur'
    });
  }
};

// Middleware pour vérifier si l'utilisateur est un super administrateur
exports.isSuperAdmin = async (req, res, next) => {
  try {
    console.log(" isSuperAdmin check for user:", req.user?.id);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    console.log(" User role:", user?.role);
    
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits de super administrateur requis.'
      });
    }

    next();
  } catch (error) {
    console.error(' SuperAdmin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des droits de super administrateur'
    });
  }
};