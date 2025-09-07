const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const memorySchema = new Schema({
  contenu: {
    type: String,
    required: true,
    trim: true
  },
  auteur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
 
  video: {
    type: Schema.Types.ObjectId,
    ref: 'Video'
  },
  podcast: {
    type: Schema.Types.ObjectId,
    ref: 'Podcast'
  },
  // Type de mémoire
  type: {
    type: String,
    enum: ['posted', 'shared'],
    default: 'posted'
  },
  // Compteurs d'interactions
  likes: {
    type: Number,
    default: 0
  },
  comments: {
    type: Number,
    default: 0
  },
  // Liste des utilisateurs qui ont aimé cette mémoire
  likedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  versionKey: false
});

// Middleware pour valider qu'une mémoire est associée soit à une vidéo, soit à un podcast
memorySchema.pre('validate', function(next) {
  if (!this.video && !this.podcast) {
    this.invalidate('video', 'Une mémoire doit être associée à une vidéo ou à un podcast');
  }
  next();
});

// Méthode pour vérifier si un utilisateur a aimé cette mémoire
memorySchema.methods.isLikedByUser = function(userId) {
  if (!this.likedBy) return false;
  return this.likedBy.some(id => id.toString() === userId.toString());
};

// Méthode pour ajouter un like
memorySchema.methods.addLike = async function(userId) {
  if (!this.likedBy) {
    this.likedBy = [];
  }
  
  // Vérifier si l'utilisateur a déjà aimé
  if (!this.isLikedByUser(userId)) {
    this.likedBy.push(userId);
    this.likes = this.likedBy.length;
    await this.save();
  }
};

// Méthode pour retirer un like
memorySchema.methods.removeLike = async function(userId) {
  if (!this.likedBy) return;
  
  // Filtrer le tableau pour retirer l'ID de l'utilisateur
  this.likedBy = this.likedBy.filter(id => id.toString() !== userId.toString());
  this.likes = this.likedBy.length;
  await this.save();
};

module.exports = model('Memory', memorySchema);