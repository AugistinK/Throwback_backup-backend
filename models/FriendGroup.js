// models/FriendGroup.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const friendGroupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    members: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    color: {
      type: String,
      default: '#b31217'
    },
    description: {
      type: String,
      trim: true
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

// Index pour optimiser les recherches
friendGroupSchema.index({ owner: 1 });
friendGroupSchema.index({ members: 1 });

// Méthode pour ajouter des membres
friendGroupSchema.methods.addMembers = function(memberIds) {
  const currentMembers = this.members.map(id => id.toString());
  const newMembers = memberIds.filter(id => !currentMembers.includes(id.toString()));
  this.members.push(...newMembers);
  return this.save();
};

// Méthode pour retirer des membres
friendGroupSchema.methods.removeMembers = function(memberIds) {
  const idsToRemove = memberIds.map(id => id.toString());
  this.members = this.members.filter(id => !idsToRemove.includes(id.toString()));
  return this.save();
};

module.exports = model('FriendGroup', friendGroupSchema);