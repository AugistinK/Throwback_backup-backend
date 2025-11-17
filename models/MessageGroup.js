// models/MessageGroup.js - MODÈLE SPÉCIFIQUE POUR LES MESSAGES DE GROUPE
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const messageGroupSchema = new Schema(
  {
    // Expéditeur (toujours requis)
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    
    // Groupe (toujours requis)
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    
    // Contenu du message
    content: {
      type: String,
      required: true,
      trim: true
    },
    
    type: {
      type: String,
      enum: ['text', 'image', 'music', 'video', 'file', 'audio'],
      default: 'text'
    },
    
    // Système de lecture pour les groupes
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
    
    // Édition
    edited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },
    editHistory: [{
      content: {
        type: String,
        required: true
      },
      editedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Suppression
    deleted: {
      type: Boolean,
      default: false
    },
    deletedForEveryone: {
      type: Boolean,
      default: false
    },
    deletedBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
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
      ref: 'MessageGroup'
    },
    
    // Métadonnées pour fichiers/médias
    fileUrl: {
      type: String
    },
    fileName: {
      type: String
    },
    fileSize: {
      type: Number
    },
    mimeType: {
      type: String
    },
    
    // Métadonnées système
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
messageGroupSchema.index({ groupId: 1, created_date: -1 });
messageGroupSchema.index({ sender: 1, groupId: 1 });
messageGroupSchema.index({ deleted: 1, deletedForEveryone: 1 });

// Méthode pour marquer comme lu par un utilisateur
messageGroupSchema.methods.markAsReadByUser = async function(userId) {
  // Vérifier si l'utilisateur a déjà lu
  const alreadyRead = this.readBy.some(
    (r) => r.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    this.modified_date = new Date();
    await this.save();
  }
  
  return this;
};

// Méthode pour éditer un message
messageGroupSchema.methods.edit = async function(newContent, editedBy) {
  // Sauvegarder l'ancien contenu dans l'historique
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  
  this.content = newContent;
  this.edited = true;
  this.editedAt = new Date();
  this.modified_by = editedBy;
  this.modified_date = new Date();
  
  return this.save();
};

// Méthode pour supprimer pour tout le monde
messageGroupSchema.methods.deleteForEveryone = async function() {
  this.deletedForEveryone = true;
  this.deleted = true;
  this.content = 'This message was deleted';
  this.modified_date = new Date();
  return this.save();
};

// Méthode pour supprimer pour un utilisateur
messageGroupSchema.methods.deleteForUser = async function(userId) {
  if (!this.deletedBy.includes(userId)) {
    this.deletedBy.push(userId);
    this.modified_date = new Date();
  }
  return this.save();
};

// Méthode statique pour obtenir les statistiques d'un groupe
messageGroupSchema.statics.getGroupStats = async function(groupId) {
  const stats = await this.aggregate([
    {
      $match: {
        groupId: new mongoose.Types.ObjectId(groupId),
        deleted: false,
        deletedForEveryone: false
      }
    },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        totalMedia: {
          $sum: {
            $cond: [
              { $in: ['$type', ['image', 'video', 'audio', 'file']] },
              1,
              0
            ]
          }
        },
        uniqueSenders: { $addToSet: '$sender' }
      }
    },
    {
      $project: {
        _id: 0,
        totalMessages: 1,
        totalMedia: 1,
        uniqueSenders: { $size: '$uniqueSenders' }
      }
    }
  ]);
  
  return stats.length > 0 ? stats[0] : {
    totalMessages: 0,
    totalMedia: 0,
    uniqueSenders: 0
  };
};

// Méthode statique pour obtenir les messages non lus d'un utilisateur dans un groupe
messageGroupSchema.statics.getUnreadCount = async function(groupId, userId) {
  const count = await this.countDocuments({
    groupId,
    deleted: false,
    deletedForEveryone: false,
    'readBy.user': { $ne: userId }
  });
  
  return count;
};

// Hook pre-save pour mettre à jour modified_date
messageGroupSchema.pre('save', function(next) {
  this.modified_date = new Date();
  next();
});

// Virtual pour obtenir le nombre de lectures
messageGroupSchema.virtual('readCount').get(function() {
  return this.readBy.length;
});

// Virtual pour vérifier si édité
messageGroupSchema.virtual('hasBeenEdited').get(function() {
  return this.edited && this.editHistory.length > 0;
});

// S'assurer que les virtuals sont inclus lors de la conversion en JSON
messageGroupSchema.set('toJSON', { virtuals: true });
messageGroupSchema.set('toObject', { virtuals: true });

module.exports = model('MessageGroup', messageGroupSchema);