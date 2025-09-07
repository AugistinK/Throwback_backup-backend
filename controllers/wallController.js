// controllers/wallController.js
const WallPost = require('../models/WallPost');

const normalizeTags = (txt='') =>
  (txt.match(/#([a-zA-Z0-9_]{2,30})/g) || []).map(t => t.slice(1).toLowerCase());

exports.createPost = async (req, res) => {
  try {
    const media = (req.files || []).map(f => ({
      type: f.mimetype.startsWith('image') ? 'image' : 'video',
      url: `/uploads/wall/${f.filename}`
    }));
    const tags = [
      ...(req.body.tags ? [].concat(req.body.tags).flat() : []),
      ...normalizeTags(req.body.text)
    ].filter(Boolean);

    const post = await WallPost.create({
      user: req.user.id,
      text: req.body.text || '',
      tags: [...new Set(tags)],
      media,
      visibility: req.body.visibility || 'public'
    });

    res.json({ success: true, data: post });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.getFeed = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1',10),1);
  const limit = Math.min(parseInt(req.query.limit || '20',10),50);
  const q = req.query.q?.trim();
  const tag = req.query.tag?.toLowerCase();

  const filter = { visibility: 'public' };
  if (q) filter.$text = { $search: q };
  if (tag) filter.tags = tag;

  const posts = await WallPost.find(filter)
    .sort({ createdAt: -1 })
    .skip((page-1)*limit)
    .limit(limit)
    .populate('user', 'prenom nom avatar');

  const total = await WallPost.countDocuments(filter);
  res.json({
    success: true,
    data: posts,
    pagination: { page, limit, total, totalPages: Math.ceil(total/limit) }
  });
};

exports.getById = async (req, res) => {
  const post = await WallPost
    .findById(req.params.id)
    .populate('user','prenom nom avatar');
  if (!post) return res.status(404).json({ success:false, message:'Post not found' });
  res.json({ success:true, data: post });
};

exports.react = async (req, res) => {
  const { type='like' } = req.body;
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ success:false, message:'Post not found' });

  // toggle
  const already = post.reactions.find(r => r.user.toString() === req.user.id);
  if (already && already.type === type) {
    post.reactions = post.reactions.filter(r => r.user.toString() !== req.user.id);
  } else {
    post.reactions = post.reactions.filter(r => r.user.toString() !== req.user.id);
    post.reactions.push({ user: req.user.id, type });
  }
  post.reactionsCount = post.reactions.length;
  await post.save();
  res.json({ success:true, data:{ reactionsCount: post.reactionsCount, reactions: post.reactions } });
};

exports.comment = async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ success:false, message:'Comment required' });
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ success:false, message:'Post not found' });
  post.comments.push({ user: req.user.id, text: text.trim() });
  post.commentsCount = post.comments.length;
  await post.save();
  res.json({ success:true, data: post.comments[post.comments.length-1], commentsCount: post.commentsCount });
};
