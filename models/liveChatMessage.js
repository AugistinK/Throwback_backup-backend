const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const liveChatMessageSchema = new Schema({
  livestreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
  userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content:      { type: String, required: true, trim: true, maxlength: 500 },
  parentId:     { type: Schema.Types.ObjectId, ref: 'LiveChatMessage', default: null },
  isDeleted:    { type: Boolean, default: false },
  isModerated:  { type: Boolean, default: false },
  moderationReason: { type: String, default: null },
  likes:        { type: Number, default: 0 },
  likedBy:      [{ type: Schema.Types.ObjectId, ref: 'User' }],
  metadata:     { userAgent: String, ipAddress: String, location: String }
}, {
  timestamps: true,
  versionKey: false
});

liveChatMessageSchema.index({ livestreamId: 1, createdAt: -1 });
liveChatMessageSchema.index({ parentId: 1 });

liveChatMessageSchema.virtual('replies', {
  ref: 'LiveChatMessage',
  localField: '_id',
  foreignField: 'parentId',
  options: { sort: { createdAt: 1 } }
});

// 🔢 compteur de replies
liveChatMessageSchema.virtual('repliesCount', {
  ref: 'LiveChatMessage',
  localField: '_id',
  foreignField: 'parentId',
  count: true
});

liveChatMessageSchema.path('content').validate(function (value) {
  return value.length <= 500 && value.trim().length > 0;
}, 'Le contenu du message doit être non vide et ne pas dépasser 500 caractères');

liveChatMessageSchema.path('likes').validate(function (value) {
  return value >= 0;
}, 'Le nombre de likes ne peut pas être négatif');

liveChatMessageSchema.statics.getStreamMessages = async function (streamId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const docs = await this.find({
    livestreamId: streamId,
    parentId: null,
    isDeleted: false
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'nom prenom photo_profil')
    .populate({ path: 'replies', match: { isDeleted: false }, populate: { path: 'userId', select: 'nom prenom photo_profil' }, options: { limit: 3, sort: { createdAt: 1 } } })
    .populate('repliesCount'); // 👉 ajoute le compteur

  return docs;
};

liveChatMessageSchema.statics.addLike = async function (messageId, userId) {
  return this.findOneAndUpdate(
    { _id: messageId, likedBy: { $ne: userId } },
    { $inc: { likes: 1 }, $push: { likedBy: userId } },
    { new: true }
  );
};

liveChatMessageSchema.statics.removeLike = async function (messageId, userId) {
  return this.findOneAndUpdate(
    { _id: messageId, likedBy: userId },
    { $inc: { likes: -1 }, $pull: { likedBy: userId } },
    { new: true }
  );
};

liveChatMessageSchema.statics.moderateMessage = async function (messageId, reason, moderatorId) {
  return this.findByIdAndUpdate(
    messageId,
    {
      isModerated: true,
      isDeleted: true,
      moderationReason: reason || 'Contenu inapproprié',
      content: '[Message supprimé par un modérateur]',
      modified_by: moderatorId
    },
    { new: true }
  );
};

liveChatMessageSchema.set('toJSON', { virtuals: true });
liveChatMessageSchema.set('toObject', { virtuals: true });

module.exports = model('LiveChatMessage', liveChatMessageSchema);
