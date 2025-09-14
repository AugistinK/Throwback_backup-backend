// models/Like.js - NOUVELLE VERSION
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const likeSchema = new Schema({
  // Type d'entité likée (vidéo, post ou commentaire)
  type_entite: {
    type: String,
    enum: ['VIDEO', 'POST', 'COMMENT'],
    required: [true, 'Le type d\'entité est requis']
  },
  
  // ID de l'entité likée (stocké comme ObjectId générique)
  entite_id: {
    type: Schema.Types.ObjectId,
    required: [true, 'L\'ID de l\'entité est requis']
  },
  
  // Utilisateur qui a liké/disliké
  utilisateur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  
  // Type d'action (LIKE ou DISLIKE)
  type_action: {
    type: String,
    enum: ['LIKE', 'DISLIKE'],
    default: 'LIKE',
    required: true
  },
  
  // Référence optionnelle vers la vidéo (si type_entite est VIDEO ou commentaire sur vidéo)
  video_id: {
    type: Schema.Types.ObjectId,
    ref: 'Video'
  },
  
  // Référence optionnelle vers le post (si type_entite est POST ou commentaire sur post)
  post_id: {
    type: Schema.Types.ObjectId,
    ref: 'Post'
  },
  
  // Métadonnées de traçabilité
  created_by: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  modified_by: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  modified_date: {
    type: Date
  }
}, {
  timestamps: { 
    createdAt: 'creation_date', 
    updatedAt: 'modified_date' 
  },
  versionKey: false
});

// Index composé pour éviter les doublons (un utilisateur ne peut faire qu'une action par entité)
likeSchema.index({ utilisateur: 1, type_entite: 1, entite_id: 1 }, { unique: true });

// Autres index pour optimisation des requêtes
likeSchema.index({ type_entite: 1, entite_id: 1 });
likeSchema.index({ video_id: 1 });
likeSchema.index({ post_id: 1 });
likeSchema.index({ utilisateur: 1 });

// Méthodes statiques utiles
likeSchema.statics.getLikesCount = function(type, id) {
  return this.countDocuments({ type_entite: type, entite_id: id, type_action: 'LIKE' });
};

likeSchema.statics.getDislikesCount = function(type, id) {
  return this.countDocuments({ type_entite: type, entite_id: id, type_action: 'DISLIKE' });
};

likeSchema.statics.getUserInteraction = async function(type, id, userId) {
  const interaction = await this.findOne({ 
    type_entite: type, 
    entite_id: id, 
    utilisateur: userId 
  });
  
  return {
    liked: interaction?.type_action === 'LIKE',
    disliked: interaction?.type_action === 'DISLIKE'
  };
};

// Middleware pre-save pour la validation et initialisation
likeSchema.pre('save', function(next) {
  // Définir created_by si pas déjà défini
  if (!this.created_by) {
    this.created_by = this.utilisateur;
  }
  
  // Pas besoin de vérifier video_id ou post_id obligatoirement
  next();
});

// Export du modèle
module.exports = model('Like', likeSchema);