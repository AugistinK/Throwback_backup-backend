const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const podcastSchema = new Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  episode: {
    type: Number,
    required: true
  },
  season: {
    type: Number,
    default: 1
  },
  vimeoUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number, 
    required: true
  },
  coverImage: {
    type: String,
    default: '/images/podcast-default.jpg'
  },
  description: {
    type: String,
    trim: true
  },
  guestName: {
    type: String,
    trim: true
  },
  hostName: {
    type: String,
    default: 'Mike Levis',
    trim: true
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  topics: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['PERSONAL BRANDING', 'MUSIC BUSINESS', 'ARTIST INTERVIEW', 'INDUSTRY INSIGHTS', 'THROWBACK HISTORY', 'OTHER'],
    default: 'PERSONAL BRANDING'
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  isHighlighted: {
    type: Boolean,
    default: false
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  // Ajouter ce tableau pour les likes
  likes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  versionKey: false
});

// Méthode pour formater l'épisode (ex: "EP.01")
podcastSchema.methods.getFormattedEpisode = function() {
  return `EP.${this.episode.toString().padStart(2, '0')}`;
};

// Méthode pour extraire l'ID Vimeo à partir de l'URL
podcastSchema.methods.getVimeoId = function() {
  try {
    const url = new URL(this.vimeoUrl);
    if (url.hostname.includes('vimeo.com')) {
      // Format: https://vimeo.com/123456789
      const pathParts = url.pathname.split('/').filter(Boolean);
      return pathParts[0];
    } else if (url.hostname.includes('player.vimeo.com')) {
      // Format: https://player.vimeo.com/video/123456789
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'video') {
        return pathParts[1];
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting Vimeo ID:', error);
    return null;
  }
};

// Middleware pour valider l'URL Vimeo
podcastSchema.pre('validate', function(next) {
  try {
    const url = new URL(this.vimeoUrl);
    const isVimeoUrl = url.hostname.includes('vimeo.com') || url.hostname.includes('player.vimeo.com');
    
    if (!isVimeoUrl) {
      this.invalidate('vimeoUrl', 'L\'URL doit être une URL Vimeo valide');
    }
    
    next();
  } catch (error) {
    this.invalidate('vimeoUrl', 'L\'URL doit être une URL valide');
    next();
  }
});

/**
 * Vérifier si un utilisateur a aimé ce podcast
 * @param {String} userId - ID de l'utilisateur
 * @returns {Boolean} - true si l'utilisateur a aimé, false sinon
 */
podcastSchema.methods.isLikedByUser = function(userId) {
  if (!this.likes) return false;
  return this.likes.some(id => id.toString() === userId.toString());
};

/**
 * Ajouter un like d'utilisateur à ce podcast
 * @param {String} userId - ID de l'utilisateur
 */
podcastSchema.methods.addLike = async function(userId) {
  if (!this.likes) {
    this.likes = [];
  }
  
  // Vérifier si l'utilisateur a déjà aimé
  const alreadyLiked = this.isLikedByUser(userId);
  if (!alreadyLiked) {
    this.likes.push(userId);
    this.likeCount = this.likes.length;
    await this.save();
  }
  
  return !alreadyLiked;
};

/**
 * Retirer un like d'utilisateur de ce podcast
 * @param {String} userId - ID de l'utilisateur
 */
podcastSchema.methods.removeLike = async function(userId) {
  if (!this.likes) return false;
  
  // Filtrer le tableau pour retirer l'ID de l'utilisateur
  const initialLength = this.likes.length;
  this.likes = this.likes.filter(id => id.toString() !== userId.toString());
  
  if (this.likes.length < initialLength) {
    this.likeCount = this.likes.length;
    await this.save();
    return true;
  }
  
  return false;
};

module.exports = model('Podcast', podcastSchema);