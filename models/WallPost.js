// models/WallPost.js
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image','video'], required: true },
  url: { type: String, required: true },
  width: Number,
  height: Number,
  duration: Number
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, enum: ['like','love','fire','nostalgic'], default: 'like' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  text: { type: String, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now }
});

const wallPostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  text: { type: String, trim: true, maxlength: 2000 },
  tags: [{ type: String, index: true }],
  media: [mediaSchema],
  visibility: { type: String, enum: ['public','followers','private'], default: 'public', index: true },
  reactions: [reactionSchema],
  comments: [commentSchema],
  commentsCount: { type: Number, default: 0 },
  reactionsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

wallPostSchema.index({ text: 'text', tags: 1 });

module.exports = mongoose.model('WallPost', wallPostSchema);
