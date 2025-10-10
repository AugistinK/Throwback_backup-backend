// models/Message.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'image', 'music', 'video', 'file'],
      default: 'text'
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date
    },
    deleted: {
      type: Boolean,
      default: false
    },
    deletedBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
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
messageSchema.index({ sender: 1, receiver: 1, created_date: -1 });
messageSchema.index({ receiver: 1, read: 1 });
messageSchema.index({ created_date: -1 });

// Méthode statique pour obtenir les conversations d'un utilisateur
messageSchema.statics.getConversations = async function(userId) {
  const conversations = await this.aggregate([
    {
      $match: {
        $or: [
          { sender: mongoose.Types.ObjectId(userId) },
          { receiver: mongoose.Types.ObjectId(userId) }
        ],
        deleted: false
      }
    },
    {
      $sort: { created_date: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', mongoose.Types.ObjectId(userId)] },
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
                  { $eq: ['$receiver', mongoose.Types.ObjectId(userId)] },
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
};

// Méthode pour marquer comme lu
messageSchema.methods.markAsRead = function() {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

module.exports = model('Message', messageSchema);