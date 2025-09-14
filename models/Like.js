// models/Like.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Modèle générique de réaction (LIKE/DISLIKE) sur n'importe quelle entité:
 * - VIDEO, POST, COMMENT via (type_entite, entite_id)
 */
const likeSchema = new Schema({
  type_entite: {
    type: String,
    enum: ['VIDEO', 'POST', 'COMMENT'],
    required: [true, "Le type d'entité est requis"],
  },

  entite_id: {
    type: Schema.Types.ObjectId,
    required: [true, "L'ID de l'entité est requis"],
  },

  utilisateur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "L'utilisateur est requis"],
  },

  type_action: {
    type: String,
    enum: ['LIKE', 'DISLIKE'],
    default: 'LIKE',
    required: true,
  },

  // Métadonnées optionnelles
  video_id: { type: Schema.Types.ObjectId, ref: 'Video' },
  post_id:  { type: Schema.Types.ObjectId, ref: 'Post' },

  created_by:  { type: Schema.Types.ObjectId, ref: 'User' },
  modified_by: { type: Schema.Types.ObjectId, ref: 'User' },
  modified_date: { type: Date },
}, {
  timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
  versionKey: false,
});

// Un utilisateur ne peut avoir qu'UNE interaction par entité
likeSchema.index({ utilisateur: 1, type_entite: 1, entite_id: 1 }, { unique: true });

// Aides de lecture
likeSchema.index({ type_entite: 1, entite_id: 1 });
likeSchema.index({ utilisateur: 1 });

likeSchema.statics.getLikesCount = function(type, id) {
  return this.countDocuments({ type_entite: type, entite_id: id, type_action: 'LIKE' });
};

likeSchema.statics.getDislikesCount = function(type, id) {
  return this.countDocuments({ type_entite: type, entite_id: id, type_action: 'DISLIKE' });
};

likeSchema.statics.getUserInteraction = async function(type, id, userId) {
  const doc = await this.findOne({ type_entite: type, entite_id: id, utilisateur: userId });
  return { liked: doc?.type_action === 'LIKE', disliked: doc?.type_action === 'DISLIKE' };
};

likeSchema.pre('save', function(next) {
  if (!this.created_by) this.created_by = this.utilisateur;
  next();
});

module.exports = model('Like', likeSchema);
