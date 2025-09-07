const LogAction = require("../models/LogAction");

exports.logAction = (type, description) => {
  return async (req, res, next) => {
    try {
      if (req.user) {
        await LogAction.create({
          type_action: type,
          description_action: description,
          id_user: req.user.id,
          created_by: "SYSTEM"
        });
      }
      next();
    } catch (error) {
      console.error("Erreur de journalisation:", error);
      next(); // Continuer malgré l'erreur
    }
  };
};