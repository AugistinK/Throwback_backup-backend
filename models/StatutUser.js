const mongoose = require("mongoose");

const statutUserSchema = new mongoose.Schema({
  code_statut: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ["INACTIF", "ACTIF", "VERROUILLE", "SUSPENDU", "SUPPRIME"]
  },
  libelle_statut: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String 
  },
  couleur: { 
    type: String, 
    default: "#777777" 
  },
  ordre_affichage: { 
    type: Number, 
    default: 0 
  },
  creation_date: { 
    type: Date, 
    default: Date.now 
  },
  created_by: { 
    type: String, 
    default: "SYSTEM" 
  },
  modified_date: { 
    type: Date 
  },
  modified_by: { 
    type: String 
  }
}, {
  timestamps: false 
});

// Index pour des requêtes plus rapides
statutUserSchema.index({ code_statut: 1 });

module.exports = mongoose.model("StatutUser", statutUserSchema);