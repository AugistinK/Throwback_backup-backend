exports.authorize = (roles) => {
  return (req, res, next) => {
    console.log("Vérification des rôles:", roles);
    console.log("Rôle utilisateur:", req.user ? req.user.role : "Non connecté");
    
    if (!req.user) {
      console.log("Pas d'utilisateur, redirection vers login");
      return res.redirect('/login');
    }
    
    if (!roles.includes(req.user.role)) {
      console.log("Accès refusé, rôle insuffisant");
      return res.status(403).send("Accès refusé. Vous n'avez pas les permissions nécessaires.");
    }
    
    console.log("Autorisation accordée");
    // Pour la comparaison dans les vues
    res.locals.currentUser = req.user;
    next();
  };
};