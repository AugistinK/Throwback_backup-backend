// models/Notification.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true, // utilisateur cible (celui qui reçoit la notif)
      index: true,
    },
    type: {
      type: String,
      enum: [
        'friend_request',
        'friend_request_accepted',
        'like',
        'comment',
        'message',
        'system',
        'content', // nouveau contenu (podcast, vidéo, short…)
        'other',
      ],
      default: 'other',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String, // ex: "/dashboard/wall/123", "/dashboard/chat/456"
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    // utilisateur qui a déclenché la notif (ex: celui qui like / commente)
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // champ libre pour des infos supplémentaires (id de post, etc.)
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
  }
);

// Transforme _id -> id dans le JSON retourné au front
NotificationSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
