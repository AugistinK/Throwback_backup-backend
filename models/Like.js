// models/Like.js - Version corrigée
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const likeSchema = new Schema({
  // Type d'entité (COMMENT, VIDEO, POST)
  type_entite: {
    type: String,
    enum: ['COMMENT', 'VIDEO', 'POST'],
    required: [true, 'Le type d\'entité est requis']
  },
  
  // ID de l'entité (commentaire, vidéo ou post)
  entite_id: {
    type: Schema.Types.ObjectId,
    required: [true, 'L\'ID de l\'entité est requis']
  },
  
  // Utilisateur qui effectue l'action
  utilisateur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  
  // Type d'action (LIKE ou DISLIKE)
  type_action: {
    type: String,
    enum: ['LIKE', 'DISLIKE'],
    required: [true, 'Le type d\'action est requis']
  },
  
  // Référence optionnelle vers la vidéo (uniquement si type_entite est VIDEO)
  video_id: {
    type: Schema.Types.ObjectId,
    ref: 'Video'
  },
  
  // Référence optionnelle vers le post (uniquement si type_entite est POST ou COMMENT sur post)
  post_id: {
    type: Schema.Types.ObjectId,
    ref: 'Post'
  },
  
  // Métadonnées
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

// MODIFICATION CLÉ: Nouvel index unique basé sur type_entite et entite_id
likeSchema.index({ utilisateur: 1, type_entite: 1, entite_id: 1 }, { unique: true });

// Supprimer l'ancien index problématique s'il existe (à exécuter dans MongoDB)
// db.likes.dropIndex("utilisateur_1_video_id_1_type_like_1");

// Autres index pour optimisation
likeSchema.index({ type_entite: 1, entite_id: 1 });
likeSchema.index({ video_id: 1 });
likeSchema.index({ post_id: 1 });

// Export du modèle
module.exports = model('Like', likeSchema);