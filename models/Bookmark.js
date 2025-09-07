const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const bookmarkSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Références au contenu mis en favori (une seule doit être définie)
  video: {
    type: Schema.Types.ObjectId,
    ref: 'Video',
    default: undefined
  },
  podcast: {
    type: Schema.Types.ObjectId,
    ref: 'Podcast',
    default: undefined
  },
  // Type de contenu
  type: {
    type: String,
    enum: ['VIDEO', 'PODCAST'],
    required: true
  },
  // Notes de l'utilisateur (optionnelles)
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Middleware pour valider qu'un favori est associé soit à une vidéo, soit à un podcast
bookmarkSchema.pre('validate', function(next) {
  if (this.type === 'VIDEO' && !this.video) {
    this.invalidate('video', 'Un favori de type VIDEO doit avoir une référence à une vidéo');
  } else if (this.type === 'PODCAST' && !this.podcast) {
    this.invalidate('podcast', 'Un favori de type PODCAST doit avoir une référence à un podcast');
  }
  
  // S'assurer que seul le champ approprié est défini
  if (this.type === 'VIDEO') {
    this.podcast = undefined;
  } else if (this.type === 'PODCAST') {
    this.video = undefined;
  }
  
  next();
});

// Créer des index composites avec sparse: true pour éviter les doublons
bookmarkSchema.index({ user: 1, video: 1 }, { unique: true, sparse: true });
bookmarkSchema.index({ user: 1, podcast: 1 }, { unique: true, sparse: true });

module.exports = model('Bookmark', bookmarkSchema);