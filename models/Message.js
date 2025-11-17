// models/Message.js - VERSION COMPLÈTE AVEC SUPPORT DES GROUPES
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    // Expéditeur (toujours requis)
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    
    // Pour les messages directs (1-to-1)
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: function() {
        return !this.isGroupMessage;
      }
    },
    
    // Pour les messages de groupe
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: function() {
        return this.isGroupMessage;
      }
    },
    isGroupMessage: {
      type: Boolean,
      default: false
    },
    
    // Contenu du message
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'image', 'music', 'video', 'file', 'audio'],
      default: 'text'
    },
    
    // Statut de lecture (pour messages directs)
    read: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date
    },
    
    // Pour les groupes : tableau des utilisateurs qui ont lu
    readBy: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Suppression
    deleted: {
      type: Boolean,
      default: false
    },
    deletedBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    deletedForEveryone: {
      type: Boolean,
      default: false
    },
    
    // Édition
    edited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },
    editHistory: [{
      content: String,
      editedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Transfert
    forwarded: {
      type: Boolean,
      default: false
    },
    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Réponse à un message
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    
    // Métadonnées
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    modified_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
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
messageSchema.index({ sender: 1, receiver: 1, created_date: -1 });
messageSchema.index({ receiver: 1, read: 1 });
messageSchema.index({ groupId: 1, created_date: -1 });
messageSchema.index({ created_date: -1 });
messageSchema.index({ isGroupMessage: 1 });

// Méthode statique pour obtenir les conversations d'un utilisateur
messageSchema.statics.getConversations = async function(userId) {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    const conversations = await this.aggregate([
      {
        $match: {
          $or: [
            { sender: userObjectId },
            { receiver: userObjectId }
          ],
          deleted: false,
          isGroupMessage: false
        }
      },
      {
        $sort: { created_date: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userObjectId] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', userObjectId] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'participant'
        }
      },
      {
        $unwind: '$participant'
      },
      {
        $project: {
          participant: {
            _id: 1,
            nom: 1,
            prenom: 1,
            email: 1,
            photo_profil: 1
          },
          lastMessage: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.created_date': -1 }
      }
    ]);

    return conversations;
  } catch (error) {
    console.error('Error in getConversations:', error);
    throw error;
  }
};

// Méthode pour marquer comme lu (messages directs)
messageSchema.methods.markAsRead = function() {
  if (!this.read && !this.isGroupMessage) {
    this.read = true;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Méthode pour marquer comme lu dans un groupe
messageSchema.methods.markAsReadByUser = async function(userId) {
  if (this.isGroupMessage) {
    // Vérifier si l'utilisateur a déjà lu
    const alreadyRead = this.readBy.some(
      (r) => r.user.toString() === userId.toString()
    );
    
    if (!alreadyRead) {
      this.readBy.push({
        user: userId,
        readAt: new Date()
      });
      await this.save();
    }
  }
  return this;
};

// Méthode pour éditer un message
messageSchema.methods.edit = async function(newContent) {
  // Sauvegarder l'ancien contenu dans l'historique
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  
  this.content = newContent;
  this.edited = true;
  this.editedAt = new Date();
  
  return this.save();
};

// Méthode pour supprimer pour tout le monde
messageSchema.methods.deleteForEveryone = async function() {
  this.deletedForEveryone = true;
  this.content = 'This message was deleted';
  return this.save();
};

// Méthode pour supprimer pour un utilisateur
messageSchema.methods.deleteForUser = async function(userId) {
  if (!this.deletedBy.includes(userId)) {
    this.deletedBy.push(userId);
  }
  
  // Si les deux utilisateurs ont supprimé (dans le cas d'un message direct)
  if (!this.isGroupMessage && this.deletedBy.length === 2) {
    this.deleted = true;
  }
  
  return this.save();
};

// Hook pre-save pour mettre à jour modified_date
messageSchema.pre('save', function(next) {
  this.modified_date = new Date();
  next();
});

module.exports = model('Message', messageSchema);