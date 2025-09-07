const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Modèle pour les tokens de vérification d'email et autres usages
 */
const tokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_ACTIVATION'],
      default: 'EMAIL_VERIFICATION'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      
      expires: 604800 
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Index pour rechercher par token et par userId
tokenSchema.index({ token: 1 });
tokenSchema.index({ userId: 1 });
tokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); 

module.exports = model('Token', tokenSchema);