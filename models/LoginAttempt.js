// models/LoginAttempt.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const loginAttemptSchema = new Schema(
  {
    id_user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    ip_address: {
      type: String,
      required: true
    },
    user_agent: String,
    nb_tentatives: {
      type: Number,
      default: 0
    },
    derniere_tentative: {
      type: Date,
      default: Date.now
    },
    verrouillage_jusqu: Date,
    success: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Méthode pour vérifier si le compte est verrouillé
loginAttemptSchema.methods.estVerrouille = function() {
  return this.verrouillage_jusqu && this.verrouillage_jusqu > Date.now();
};

// Méthode pour calculer le temps restant avant déverrouillage
loginAttemptSchema.methods.tempsRestantVerrouillage = function() {
  if (!this.estVerrouille()) return 0;
  const tempRestant = Math.ceil((this.verrouillage_jusqu - Date.now()) / (1000 * 60));
  return Math.max(0, tempRestant);
};

// Méthode pour verrouiller le compte
loginAttemptSchema.methods.verrouillerCompte = function(dureeMinutes) {
  this.verrouillage_jusqu = new Date(Date.now() + dureeMinutes * 60 * 1000);
};

// Méthode pour réinitialiser les tentatives
loginAttemptSchema.methods.reinitialiser = function() {
  this.nb_tentatives = 0;
  this.verrouillage_jusqu = undefined;
  this.success = true;
};

// Index
loginAttemptSchema.index({ id_user: 1 });
loginAttemptSchema.index({ ip_address: 1 });

module.exports = model('LoginAttempt', loginAttemptSchema);