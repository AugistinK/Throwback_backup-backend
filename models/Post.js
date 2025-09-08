// models/Post.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const postSchema = new Schema({
  contenu: { 
    type: String, 
    required: true,
    maxLength: 1000
  },
  media: {
    type: String, // Chemin vers le média uploadé
    default: null
  },
  type_media: {
    type: String,
    enum: ['IMAGE', 'VIDEO', 'AUDIO', 'NONE'],
    default: 'NONE'
  },
  auteur: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  mentions: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  hashtags: [String],
  visibilite: {
    type: String,
    enum: ['PUBLIC', 'FRIENDS', 'PRIVATE'],
    default: 'PUBLIC'
  },
  likes: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  commentaires: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Comment' 
  }],
  signalements: [{
    utilisateur: { type: Schema.Types.ObjectId, ref: 'User' },
    raison: String,
    date: { type: Date, default: Date.now }
  }],
  partages: { 
    type: Number, 
    default: 0 
  },
  modere: {
    type: Boolean,
    default: false
  },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  modified_by: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuels
postSchema.virtual('nombre_likes').get(function() {
  return this.likes.length;
});

postSchema.virtual('nombre_commentaires').get(function() {
  return this.commentaires.length;
});

// Indices pour les recherches fréquentes
postSchema.index({ auteur: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ visibilite: 1 });

module.exports = model('Post', postSchema);