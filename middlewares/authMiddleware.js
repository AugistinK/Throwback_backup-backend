const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// Middleware de protection simplifié - sans populate des rôles
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

    // Récupère l'utilisateur sans populate des rôles
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. User not found.' 
      });
    }

    // Expose l'utilisateur avec id comme string
    req.user = {
      ...user.toObject(),
      id: user._id.toString()
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Invalid token.' 
    });
  }
};

// Middleware d'autorisation simplifié - vérifie le rôle unique
exports.authorize = (...roles) => (req, res, next) => {
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
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    if (!user || !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits d\'administrateur requis.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des droits d\'administrateur'
    });
  }
};

// Middleware pour vérifier si l'utilisateur est un super administrateur
exports.isSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits de super administrateur requis.'
      });
    }

    next();
  } catch (error) {
    console.error('SuperAdmin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des droits de super administrateur'
    });
  }
};