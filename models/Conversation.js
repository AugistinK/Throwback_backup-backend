// models/Conversation.js - VERSION AVEC GROUPES
const mongoose = require('mongoose');
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    // Type de conversation
    type: {
      type: String,
      enum: ['direct', 'group'],
      default: 'direct',
      required: true,
    },

    // Participants communs (direct + groupe)
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],

    // Pour les conversations directes uniquement
    user1: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    user2: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    // Pour les groupes uniquement
    groupName: {
      type: String,
      trim: true,
    },
    groupDescription: {
      type: String,
      trim: true,
    },
    groupAvatar: {
      type: String,
    },
    groupCreator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    groupAdmins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Dernier message
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Métadonnées
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    muted: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        until: Date,
      },
    ],
    pinned: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' },
    versionKey: false,
  }
);

// Index pour recherche rapide
conversationSchema.index({ participants: 1, type: 1 });
conversationSchema.index({ user1: 1, user2: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Méthode statique pour créer ou récupérer une conversation directe
conversationSchema.statics.getOrCreateDirectConversation = async function (
  userId1,
  userId2
) {
  // Chercher une conversation existante
  let conversation = await this.findOne({
    type: 'direct',
    $or: [
      { user1: userId1, user2: userId2 },
      { user1: userId2, user2: userId1 },
    ],
  }).populate('participants lastMessage');

  // Si elle n'existe pas, la créer
  if (!conversation) {
    conversation = await this.create({
      type: 'direct',
      user1: userId1,
      user2: userId2,
      participants: [userId1, userId2],
      createdBy: userId1,
    });

    await conversation.populate('participants');
  }

  return conversation;
};

// Méthode pour créer un groupe
conversationSchema.statics.createGroup = async function (
  creatorId,
  name,
  participants,
  description
) {
  // S'assurer que le créateur est dans les participants
  const allParticipants = [...new Set([creatorId, ...participants])];

  const conversation = await this.create({
    type: 'group',
    groupName: name,
    groupDescription: description,
    groupCreator: creatorId,
    groupAdmins: [creatorId],
    participants: allParticipants,
    createdBy: creatorId,
  });

  await conversation.populate('participants groupCreator groupAdmins');
  return conversation;
};

// Méthode pour ajouter un participant à un groupe
conversationSchema.methods.addParticipant = async function (userId, addedBy) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    this.modified_date = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour retirer un participant d'un groupe
conversationSchema.methods.removeParticipant = async function (userId) {
  this.participants = this.participants.filter(
    (p) => p.toString() !== userId.toString()
  );
  this.groupAdmins = this.groupAdmins.filter(
    (a) => a.toString() !== userId.toString()
  );
  this.modified_date = Date.now();
  await this.save();
  return this;
};

// Méthode pour promouvoir un admin
conversationSchema.methods.promoteAdmin = async function (userId) {
  if (!this.groupAdmins.includes(userId)) {
    this.groupAdmins.push(userId);
    this.modified_date = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour archiver
conversationSchema.methods.archive = async function (userId) {
  if (!this.archivedBy.includes(userId)) {
    this.archivedBy.push(userId);
    this.modified_date = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour désarchiver
conversationSchema.methods.unarchive = async function (userId) {
  this.archivedBy = this.archivedBy.filter(
    (id) => id.toString() !== userId.toString()
  );
  this.modified_date = Date.now();
  await this.save();
  return this;
};

// Méthode pour épingler
conversationSchema.methods.pin = async function (userId) {
  if (!this.pinned.includes(userId)) {
    this.pinned.push(userId);
    this.modified_date = Date.now();
    await this.save();
  }
  return this;
};

// Méthode pour désépingler
conversationSchema.methods.unpin = async function (userId) {
  this.pinned = this.pinned.filter(
    (id) => id.toString() !== userId.toString()
  );
  this.modified_date = Date.now();
  await this.save();
  return this;
};

// Méthodes pour mute/unmute
conversationSchema.methods.mute = async function (userId, until = null) {
  const existingMute = this.muted.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (existingMute) {
    existingMute.until = until;
  } else {
    this.muted.push({ user: userId, until });
  }
  this.modified_date = Date.now();
  await this.save();
  return this;
};

conversationSchema.methods.unmute = async function (userId) {
  this.muted = this.muted.filter(
    (m) => m.user.toString() !== userId.toString()
  );
  this.modified_date = Date.now();
  await this.save();
  return this;
};

module.exports = mongoose.model('Conversation', conversationSchema);
