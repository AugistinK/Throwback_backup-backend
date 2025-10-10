// models/Friendship.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const friendshipSchema = new Schema(
  {
    user1: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    user2: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'blocked'],
      default: 'pending'
    },
    initiator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    created_by: {
      type: String,
      default: 'SYSTEM'
    },
    modified_by: String,
    created_date: {
      type: Date,
      default: Date.now
    },
    modified_date: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' },
    versionKey: false
  }
);

// Index composé pour éviter les doublons et optimiser les recherches
friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });
friendshipSchema.index({ status: 1 });
friendshipSchema.index({ user1: 1, status: 1 });
friendshipSchema.index({ user2: 1, status: 1 });

// Méthode pour vérifier si deux utilisateurs sont amis
friendshipSchema.statics.areFriends = async function(userId1, userId2) {
  const friendship = await this.findOne({
    $or: [
      { user1: userId1, user2: userId2, status: 'accepted' },
      { user1: userId2, user2: userId1, status: 'accepted' }
    ]
  });
  return !!friendship;
};

// Méthode pour obtenir tous les amis d'un utilisateur
friendshipSchema.statics.getFriends = async function(userId) {
  const friendships = await this.find({
    $or: [
      { user1: userId, status: 'accepted' },
      { user2: userId, status: 'accepted' }
    ]
  }).populate('user1 user2', 'nom prenom email photo_profil ville statut_compte');
  
  return friendships.map(f => {
    const friend = f.user1._id.toString() === userId.toString() ? f.user2 : f.user1;
    return friend;
  });
};

// Hook pre-save pour s'assurer que user1 < user2 (éviter les doublons)
friendshipSchema.pre('save', function(next) {
  if (this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
  }
  next();
});

module.exports = model('Friendship', friendshipSchema);