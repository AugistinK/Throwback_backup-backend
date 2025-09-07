// middlewares/optionalAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware d'authentification optionnelle
 * Tente de récupérer l'utilisateur à partir du token JWT si présent,
 * mais continue la requête même si l'authentification échoue
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-mot_de_passe');
      } catch (error) {
        console.log("Token invalid, but continuing as unauthenticated user");
        req.user = null;
      }
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    console.error("Error in optional auth middleware:", error);
    req.user = null;
    next();
  }
};

module.exports = optionalAuth;