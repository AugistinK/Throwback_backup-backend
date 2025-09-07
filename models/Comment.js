// models/Comment.js 
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const commentSchema = new Schema({
  // Contenu du commentaire
  contenu: {
    type: String,
    required: [true, 'Le contenu du commentaire est requis'],
    trim: true,
    maxlength: [500, 'Le commentaire ne peut pas dépasser 500 caractères']
  },
  
  auteur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'auteur du commentaire est requis']
  },
  
  // Référence vers la vidéo commentée
  video_id: {
    type: Schema.Types.ObjectId,
    ref: 'Video',
    required: [true, 'La vidéo est requise pour un commentaire']
  },
  
  // Commentaire parent (pour les réponses)
  parent_comment: {
    type: Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  // Statut du commentaire
  statut: {
    type: String,
    enum: ['ACTIF', 'MODERE', 'SUPPRIME', 'SIGNALE'],
    default: 'ACTIF'
  },
  
  // Système de likes pour les commentaires
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  dislikes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Utilisateurs qui ont liké/disliké ce commentaire
  liked_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  disliked_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Système de signalement
  signale_par: [{
    utilisateur: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    raison: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  
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

// Index pour optimiser les requêtes
commentSchema.index({ video_id: 1, statut: 1 });
commentSchema.index({ auteur: 1 });
commentSchema.index({ parent_comment: 1 });
commentSchema.index({ creation_date: -1 });

// Index composé pour les commentaires actifs d'une vidéo
commentSchema.index({ video_id: 1, statut: 1, parent_comment: 1 });

// Méthodes statiques utiles
commentSchema.statics.getCommentsCount = function(videoId) {
  return this.countDocuments({ 
    video_id: videoId, 
    statut: 'ACTIF',
    parent_comment: null
  });
};

commentSchema.statics.getRepliesCount = function(commentId) {
  return this.countDocuments({ 
    parent_comment: commentId, 
    statut: 'ACTIF' 
  });
};

// Méthodes d'instance
commentSchema.methods.isLikedBy = function(userId) {
  return this.liked_by.some(id => id.equals(userId));
};

commentSchema.methods.isDislikedBy = function(userId) {
  return this.disliked_by.some(id => id.equals(userId));
};

commentSchema.methods.isAuthoredBy = function(userId) {
  return this.auteur.equals(userId);
};

// Middleware pre-save pour la validation et initialisation
commentSchema.pre('save', function(next) {
  // S'assurer que l'auteur est défini
  if (!this.auteur) {
    const error = new Error('L\'auteur est requis pour créer un commentaire');
    error.name = 'ValidationError';
    return next(error);
  }
  
  // S'assurer que la vidéo est définie
  if (!this.video_id) {
    const error = new Error('La vidéo est requise pour créer un commentaire');
    error.name = 'ValidationError';
    return next(error);
  }
  
  // Initialiser les tableaux s'ils ne sont pas définis
  if (!this.liked_by) this.liked_by = [];
  if (!this.disliked_by) this.disliked_by = [];
  if (!this.signale_par) this.signale_par = [];
  
  // Définir created_by si pas déjà défini
  if (!this.created_by) {
    this.created_by = this.auteur;
  }
  
  // Nettoyer le contenu
  if (this.contenu) {
    this.contenu = this.contenu.trim();
  }
  
  next();
});

// Middleware post-save pour mettre à jour les compteurs
commentSchema.post('save', async function(doc) {
  try {
    // Mettre à jour le compteur de commentaires de la vidéo
    const Video = mongoose.model('Video');
    const video = await Video.findById(doc.video_id);
    
    if (video) {
      if (!video.meta) video.meta = {};
      
      const commentCount = await mongoose.model('Comment').countDocuments({
        video_id: doc.video_id,
        statut: 'ACTIF',
        parent_comment: null
      });
      
      video.meta.commentCount = commentCount;
      await video.save();
    }
  } catch (error) {
    console.warn('Erreur lors de la mise à jour du compteur de commentaires:', error);
  }
});

// Export du modèle
module.exports = model('Comment', commentSchema);