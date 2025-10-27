const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

/**
 * Middleware de protection
 */
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
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token.' 
      });
    }

    const user = await User.findById(decoded.id)
      .select('-mot_de_passe -password_reset_token -password_reset_expires -token_verification')
      .lean();

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    if (user.statut_compte === 'SUSPENDU' || user.statut_compte === 'SUPPRIME') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account suspended or deleted.' 
      });
    }

    req.user = {
      _id: user._id,
      id: user._id.toString(),
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role || 'user',
      statut_compte: user.statut_compte,
      statut_verification: user.statut_verification,
      photo_profil: user.photo_profil,
      compte_prive: user.compte_prive,
      date_inscription: user.date_inscription
    };

    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
};

exports.guest = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return res.status(403).json({
      success: false,
      message: 'Already authenticated.'
    });
  }
  next();
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required.' 
    });
  }

  const userRole = (req.user.role || '').toLowerCase();
  const hasRole = roles.some(r => r.toLowerCase() === userRole);

  if (!hasRole) {
    return res.status(403).json({ 
      success: false, 
      message: `Access denied. Required: ${roles.join(', ')}` 
    });
  }
  
  next();
};

exports.isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const userRole = (req.user.role || '').toLowerCase();
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.'
    });
  }

  next();
};

exports.isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const userRole = (req.user.role || '').toLowerCase();
  if (userRole !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required.'
    });
  }

  next();
};

exports.isOwner = (paramName = 'id') => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const resourceId = req.params[paramName];
  const userId = req.user.id;

  if (resourceId !== userId) {
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }
  }

  next();
};

exports.requireEmailVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  if (!req.user.statut_verification) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required.'
    });
  }

  next();
};

exports.optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next();
    }
    
    const token = header.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id)
        .select('-mot_de_passe -password_reset_token')
        .lean();
      
      if (user && user.statut_compte !== 'SUSPENDU' && user.statut_compte !== 'SUPPRIME') {
        req.user = {
          _id: user._id,
          id: user._id.toString(),
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          role: user.role || 'user',
          statut_compte: user.statut_compte,
          photo_profil: user.photo_profil
        };
      }
    } catch (jwtError) {
      // Continue without req.user
    }
    
    next();
  } catch (error) {
    next();
  }
};