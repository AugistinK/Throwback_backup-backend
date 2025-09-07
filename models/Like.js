// models/Like.js - MODÈLE CORRIGÉ
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const likeSchema = new Schema({
  
  utilisateur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis pour un like']
  },
  
  // Référence vers la vidéo likée
  video_id: {
    type: Schema.Types.ObjectId,
    ref: 'Video',
    required: [true, 'La vidéo est requise pour un like']
  },
  
  // Type de like (LIKE ou DISLIKE)
  type_like: {
    type: String,
    enum: ['LIKE', 'DISLIKE'],
    default: 'LIKE',
    required: true
  },
  
  // Métadonnées de traçabilité
  created_by: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  modified_by: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { 
    createdAt: 'creation_date', 
    updatedAt: 'modified_date' 
  },
  versionKey: false
});

// Index composé pour éviter les doublons (un utilisateur ne peut liker qu'une fois une vidéo avec le même type)
likeSchema.index({ utilisateur: 1, video_id: 1, type_like: 1 }, { unique: true });

// Index pour optimiser les requêtes
likeSchema.index({ video_id: 1 });
likeSchema.index({ utilisateur: 1 });

// Méthodes statiques utiles
likeSchema.statics.getLikesCount = function(videoId) {
  return this.countDocuments({ video_id: videoId, type_like: 'LIKE' });
};

likeSchema.statics.getDislikesCount = function(videoId) {
  return this.countDocuments({ video_id: videoId, type_like: 'DISLIKE' });
};

likeSchema.statics.getUserInteraction = async function(videoId, userId) {
  const interactions = await this.find({ 
    video_id: videoId, 
    utilisateur: userId 
  });
  
  return {
    liked: interactions.some(i => i.type_like === 'LIKE'),
    disliked: interactions.some(i => i.type_like === 'DISLIKE')
  };
};

// Middleware pre-save pour la validation
likeSchema.pre('save', function(next) {
  // S'assurer que l'utilisateur et la vidéo sont définis
  if (!this.utilisateur) {
    const error = new Error('L\'utilisateur est requis pour créer un like');
    error.name = 'ValidationError';
    return next(error);
  }
  
  if (!this.video_id) {
    const error = new Error('La vidéo est requise pour créer un like');
    error.name = 'ValidationError';
    return next(error);
  }
  
  // Définir created_by si pas déjà défini
  if (!this.created_by) {
    this.created_by = this.utilisateur;
  }
  
  next();
});

// Export du modèle
module.exports = model('Like', likeSchema);