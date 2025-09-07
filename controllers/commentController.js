// controllers/commentController.js
const Comment = require('../models/Comment');
const Video = require('../models/Video');
const Like = require('../models/Like');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Get comments for a video
 * @route   GET /api/public/videos/:videoId/comments
 * @access  Public
 */
exports.getVideoComments = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 10, sortBy = 'recent' } = req.query;
    
    // Validate video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'popular':
        sortOptions = { likes: -1, creation_date: -1 };
        break;
      case 'oldest':
        sortOptions = { creation_date: 1 };
        break;
      case 'recent':
      default:
        sortOptions = { creation_date: -1 };
        break;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get top-level comments (not replies)
    const filter = {
      video_id: videoId,
      statut: 'ACTIF',
      parent_comment: null
    };
    
    const total = await Comment.countDocuments(filter);
    
    const comments = await Comment.find(filter)
      .populate('auteur', 'nom prenom photo_profil')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await Comment.find({
          parent_comment: comment._id,
          statut: 'ACTIF'
        })
        .populate('auteur', 'nom prenom photo_profil')
        .sort({ creation_date: 1 })
        .limit(5) // Limit replies shown initially
        .lean();
        
        // Get total reply count
        const totalReplies = await Comment.countDocuments({
          parent_comment: comment._id,
          statut: 'ACTIF'
        });
        
        // Check user interactions if authenticated
        let userInteraction = {};
        if (req.user) {
          const userLike = await Like.findOne({
            type_entite: 'COMMENT',
            entite_id: comment._id,
            utilisateur: req.user._id
          });
          
          userInteraction = {
            liked: userLike?.type_action === 'LIKE',
            disliked: userLike?.type_action === 'DISLIKE'
          };
          
          // Check replies interactions
          for (let reply of replies) {
            const replyLike = await Like.findOne({
              type_entite: 'COMMENT',
              entite_id: reply._id,
              utilisateur: req.user._id
            });
            
            reply.userInteraction = {
              liked: replyLike?.type_action === 'LIKE',
              disliked: replyLike?.type_action === 'DISLIKE'
            };
          }
        }
        
        return {
          ...comment,
          userInteraction,
          replies,
          totalReplies,
          hasMoreReplies: totalReplies > 5
        };
      })
    );
    
    res.json({
      success: true,
      data: commentsWithReplies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting video comments:', err);
    next(err);
  }
};

/**
 * @desc    Get replies for a comment
 * @route   GET /api/public/comments/:commentId/replies
 * @access  Public
 */
exports.getCommentReplies = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const filter = {
      parent_comment: commentId,
      statut: 'ACTIF'
    };
    
    const total = await Comment.countDocuments(filter);
    
    const replies = await Comment.find(filter)
      .populate('auteur', 'nom prenom photo_profil')
      .sort({ creation_date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Add user interactions
    if (req.user) {
      for (let reply of replies) {
        const userLike = await Like.findOne({
          type_entite: 'COMMENT',
          entite_id: reply._id,
          utilisateur: req.user._id
        });
        
        reply.userInteraction = {
          liked: userLike?.type_action === 'LIKE',
          disliked: userLike?.type_action === 'DISLIKE'
        };
      }
    }
    
    res.json({
      success: true,
      data: replies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting comment replies:', err);
    next(err);
  }
};

/**
 * @desc    Add a comment to a video
 * @route   POST /api/public/videos/:videoId/comments
 * @access  Private
 */
exports.addComment = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const { contenu, parent_comment } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }
    
    if (contenu.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Comment cannot exceed 500 characters'
      });
    }
    
    // Validate video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Validate parent comment if provided
    if (parent_comment) {
      const parentComment = await Comment.findById(parent_comment);
      if (!parentComment || !parentComment.video_id.equals(videoId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent comment'
        });
      }
    }
    
    // Create comment
    const comment = await Comment.create({
      contenu: contenu.trim(),
      video_id: videoId,
      auteur: userId,
      parent_comment: parent_comment || null
    });
    
    // Populate author info
    await comment.populate('auteur', 'nom prenom photo_profil');
    
    // Log action
    await LogAction.create({
      type_action: 'COMMENT_ADDED',
      description_action: `Added comment on video: ${video.titre}`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        video_id: videoId,
        comment_id: comment._id,
        is_reply: !!parent_comment
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        ...comment.toObject(),
        userInteraction: {
          liked: false,
          disliked: false
        },
        replies: [],
        totalReplies: 0,
        hasMoreReplies: false
      }
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    next(err);
  }
};

/**
 * @desc    Update a comment
 * @route   PUT /api/public/comments/:commentId
 * @access  Private
 */
exports.updateComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { contenu } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }
    
    if (contenu.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Comment cannot exceed 500 characters'
      });
    }
    
    // Find comment
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    
    // Check ownership
    if (!comment.auteur.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own comments'
      });
    }
    
    // Check if comment is still editable (within 15 minutes)
    const editTimeLimit = 15 * 60 * 1000; // 15 minutes
    const timeSinceCreation = Date.now() - comment.creation_date.getTime();
    
    if (timeSinceCreation > editTimeLimit) {
      return res.status(400).json({
        success: false,
        message: 'Comments can only be edited within 15 minutes of posting'
      });
    }
    
    // Update comment
    comment.contenu = contenu.trim();
    comment.modified_by = userId;
    comment.modified_date = new Date();
    await comment.save();
    
    await comment.populate('auteur', 'nom prenom photo_profil');
    
    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: comment
    });
  } catch (err) {
    console.error('Error updating comment:', err);
    next(err);
  }
};

/**
 * @desc    Delete a comment
 * @route   DELETE /api/public/comments/:commentId
 * @access  Private
 */
exports.deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;
    
    // Find comment
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    
    // Check ownership or admin rights
    const isOwner = comment.auteur.equals(userId);
    const isAdmin = req.user.roles && req.user.roles.some(role => 
      ['admin', 'superadmin'].includes(role.libelle_role)
    );
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own comments'
      });
    }
    
    // Soft delete - mark as deleted
    comment.statut = 'SUPPRIME';
    comment.modified_by = userId;
    comment.modified_date = new Date();
    await comment.save();
    
    // Also soft delete all replies
    await Comment.updateMany(
      { parent_comment: commentId },
      { 
        statut: 'SUPPRIME',
        modified_by: userId,
        modified_date: new Date()
      }
    );
    
    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting comment:', err);
    next(err);
  }
};



exports.likeComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment || comment.statut !== 'ACTIF') {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const existingLike = await Like.findOne({
      type_entite: 'COMMENT',
      entite_id: commentId,
      utilisateur: userId
    });

    if (existingLike) {
      if (existingLike.type_action === 'LIKE') {
        await existingLike.deleteOne();
        comment.likes = Math.max((comment.likes || 0) - 1, 0);
        await comment.save();
        return res.json({ success: true, message: 'Comment unliked', data: { liked: false, disliked: false, likes: comment.likes, dislikes: comment.dislikes } });
      } else {
        existingLike.type_action = 'LIKE';
        await existingLike.save();
        comment.likes = (comment.likes || 0) + 1;
        comment.dislikes = Math.max((comment.dislikes || 0) - 1, 0);
        await comment.save();
        return res.json({ success: true, message: 'Comment liked', data: { liked: true, disliked: false, likes: comment.likes, dislikes: comment.dislikes } });
      }
    } else {
      await Like.create({
        type_entite: 'COMMENT',
        type_entite_model: 'Comment',
        entite_id: commentId, // ⚠️ bug corrigé (videoId -> commentId)
        utilisateur: userId,
        type_action: 'LIKE'
      });
      comment.likes = (comment.likes || 0) + 1;
      await comment.save();
      res.json({ success: true, message: 'Comment liked', data: { liked: true, disliked: false, likes: comment.likes, dislikes: comment.dislikes } });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/public/comments/:commentId/dislike
 */
exports.dislikeComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment || comment.statut !== 'ACTIF') {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const existingLike = await Like.findOne({
      type_entite: 'COMMENT',
      entite_id: commentId,
      utilisateur: userId
    });

    if (existingLike) {
      if (existingLike.type_action === 'DISLIKE') {
        await existingLike.deleteOne();
        comment.dislikes = Math.max((comment.dislikes || 0) - 1, 0);
        await comment.save();
        return res.json({ success: true, message: 'Comment un-disliked', data: { liked: false, disliked: false, likes: comment.likes, dislikes: comment.dislikes } });
      } else {
        existingLike.type_action = 'DISLIKE';
        await existingLike.save();
        comment.likes = Math.max((comment.likes || 0) - 1, 0);
        comment.dislikes = (comment.dislikes || 0) + 1;
        await comment.save();
        return res.json({ success: true, message: 'Comment disliked', data: { liked: false, disliked: true, likes: comment.likes, dislikes: comment.dislikes } });
      }
    } else {
      await Like.create({
        type_entite: 'COMMENT',
        type_entite_model: 'Comment',
        entite_id: commentId, 
        utilisateur: userId,
        type_action: 'DISLIKE' 
      });
      comment.dislikes = (comment.dislikes || 0) + 1;
      await comment.save();
      res.json({ success: true, message: 'Comment disliked', data: { liked: false, disliked: true, likes: comment.likes, dislikes: comment.dislikes } });
    }
  } catch (err) {
    next(err);
  }
};


/**
 * @desc    Report a comment
 * @route   POST /api/public/comments/:commentId/report
 * @access  Private
 */
exports.reportComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { raison } = req.body;
    const userId = req.user._id;
    
    if (!raison || raison.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required'
      });
    }
    
    // Check if comment exists
    const comment = await Comment.findById(commentId);
    if (!comment || comment.statut !== 'ACTIF') {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    
    // Check if user already reported this comment
    const alreadyReported = comment.signale_par.some(report => 
      report.utilisateur.equals(userId)
    );
    
    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this comment'
      });
    }
    
    // Add report
    comment.signale_par.push({
      utilisateur: userId,
      raison: raison.trim(),
      date: new Date()
    });
    
    // Auto-moderate if too many reports (5 or more)
    if (comment.signale_par.length >= 5) {
      comment.statut = 'MODERE';
    }
    
    await comment.save();
    
    // Log action
    await LogAction.create({
      type_action: 'COMMENT_REPORTED',
      description_action: `Reported comment for: ${raison}`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        comment_id: commentId,
        raison: raison
      }
    });
    
    res.json({
      success: true,
      message: 'Comment reported successfully'
    });
  } catch (err) {
    console.error('Error reporting comment:', err);
    next(err);
  }
};