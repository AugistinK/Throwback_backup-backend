// models/Friendship.js - 
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const friendshipSchema = new Schema(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'blocked'],
      default: 'pending'
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

//  Index pour éviter les doublons et optimiser les recherches
friendshipSchema.index({ requester: 1, receiver: 1 }, { unique: true });
friendshipSchema.index({ status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ receiver: 1, status: 1 });

/**
 *  CORRECTION: Méthode pour vérifier si deux utilisateurs sont amis
 */
friendshipSchema.statics.areFriends = async function(userId1, userId2) {
  const friendship = await this.findOne({
    $or: [
      { requester: userId1, receiver: userId2, status: 'accepted' },
      { requester: userId2, receiver: userId1, status: 'accepted' }
    ]
  });
  return !!friendship;
};

/**
 *  CORRECTION: Méthode pour obtenir tous les amis d'un utilisateur
 */
friendshipSchema.statics.getFriends = async function(userId) {
  const friendships = await this.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { receiver: userId, status: 'accepted' }
    ]
  }).populate('requester receiver', 'nom prenom email photo_profil ville statut_compte');
  
  return friendships.map(f => {
    const friend = f.requester._id.toString() === userId.toString() ? f.receiver : f.requester;
    return friend;
  });
};

/**
 *  CORRECTION: Méthode pour obtenir les demandes reçues
 */
friendshipSchema.statics.getReceivedRequests = async function(userId) {
  return await this.find({
    receiver: userId,
    status: 'pending'
  }).populate('requester', 'nom prenom email photo_profil ville statut_compte')
    .sort({ created_date: -1 });
};

/**
 *  CORRECTION: Méthode pour obtenir les demandes envoyées
 */
friendshipSchema.statics.getSentRequests = async function(userId) {
  return await this.find({
    requester: userId,
    status: 'pending'
  }).populate('receiver', 'nom prenom email photo_profil ville statut_compte')
    .sort({ created_date: -1 });
};

/**
 *  NOUVEAU: Méthode pour vérifier l'existence d'une demande
 */
friendshipSchema.statics.requestExists = async function(userId1, userId2) {
  const request = await this.findOne({
    $or: [
      { requester: userId1, receiver: userId2 },
      { requester: userId2, receiver: userId1 }
    ]
  });
  return !!request;
};

//  SUPPRIMÉ: Le hook pre-save qui causait les problèmes
// Plus de réorganisation automatique de requester/receiver

module.exports = model('Friendship', friendshipSchema);