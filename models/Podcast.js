// file_create: /home/claude/PodcastModel.js
// Amélioration de la méthode getEmbedUrl dans le modèle Podcast

const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const axios = require('axios');

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
  videoUrl: {
    type: String,
    required: true
  },
  // Nouveau champ pour stocker la plateforme
  platform: {
    type: String,
    enum: ['YOUTUBE', 'VIMEO', 'DAILYMOTION', 'OTHER'],
    default: 'OTHER'
  },
  // Identifiant unique de la vidéo sur la plateforme
  videoId: {
    type: String
  },
  duration: {
    type: Number, 
    required: true
  },
  coverImage: {
    type: String,
    default: '/images/podcast-default.jpg'
  },
  // Champ pour stocker l'image thumbnail récupérée
  thumbnailUrl: {
    type: String
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

// Fonction d'aide pour détecter la plateforme et extraire l'ID
const detectPlatform = (url) => {
  try {
    const videoUrl = new URL(url);
    const hostname = videoUrl.hostname.toLowerCase();
    
    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId;
      if (hostname.includes('youtu.be')) {
        videoId = videoUrl.pathname.substring(1);
      } else if (videoUrl.pathname.includes('/embed/')) {
        videoId = videoUrl.pathname.split('/embed/')[1];
      } else if (videoUrl.pathname.includes('/shorts/')) {
        videoId = videoUrl.pathname.split('/shorts/')[1];
      } else {
        videoId = videoUrl.searchParams.get('v');
      }
      // Nettoyer l'ID des paramètres supplémentaires
      if (videoId && videoId.includes('&')) {
        videoId = videoId.split('&')[0];
      }
      return { platform: 'YOUTUBE', videoId };
    }
    
    // Vimeo
    else if (hostname.includes('vimeo.com')) {
      const pathParts = videoUrl.pathname.split('/').filter(Boolean);
      const videoId = pathParts[0];
      // Nettoyer l'ID des paramètres supplémentaires
      return { platform: 'VIMEO', videoId };
    }
    
    // Dailymotion
    else if (hostname.includes('dailymotion.com')) {
      let videoId;
      if (videoUrl.pathname.includes('/video/')) {
        videoId = videoUrl.pathname.split('/video/')[1];
      } else {
        const pathParts = videoUrl.pathname.split('/').filter(Boolean);
        videoId = pathParts[pathParts.length - 1];
      }
      // Nettoyer l'ID des paramètres supplémentaires
      if (videoId && videoId.includes('?')) {
        videoId = videoId.split('?')[0];
      }
      return { platform: 'DAILYMOTION', videoId };
    }
    
    // Autre - essayer de déterminer à partir de l'URL
    if (url.includes('embed') || url.includes('player')) {
      // C'est probablement déjà une URL d'embed
      return { platform: 'OTHER', videoId: url };
    }
    
    return { platform: 'OTHER', videoId: null };
  } catch (error) {
    console.error('Error detecting video platform:', error);
    return { platform: 'OTHER', videoId: null };
  }
};

// Fonction pour construire l'URL de la thumbnail
const getThumbnailUrl = (platform, videoId) => {
  switch (platform) {
    case 'YOUTUBE':
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    case 'VIMEO':
      // Pour Vimeo, l'URL de la thumbnail nécessite l'API
      return null;
    case 'DAILYMOTION':
      return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
    default:
      return null;
  }
};

// Middleware pre-validate pour extraire la plateforme et l'ID
podcastSchema.pre('validate', function(next) {
  try {
    // Ne pas revalider si on est en train de faire un update partiel
    if (this.isNew || this.isModified('videoUrl')) {
      const { platform, videoId } = detectPlatform(this.videoUrl);
      this.platform = platform;
      this.videoId = videoId;
      
      // Mise à jour de l'URL de la thumbnail si on n'a pas de coverImage
      if (!this.coverImage || this.coverImage.includes('podcast-default.jpg')) {
        const thumbnailUrl = getThumbnailUrl(platform, videoId);
        if (thumbnailUrl) {
          this.thumbnailUrl = thumbnailUrl;
        }
      }
    }
    next();
  } catch (error) {
    this.invalidate('videoUrl', 'L\'URL doit être une URL vidéo valide');
    next(error);
  }
});

// Hook pour remplir l'année
podcastSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('createdAt')) {
    this.annee = this.createdAt.getFullYear();
  }
  next();
});

// Méthode améliorée pour récupérer l'URL d'embed d'une vidéo
podcastSchema.methods.getEmbedUrl = function() {
  if (!this.videoId && this.platform === 'OTHER') {
    // Si l'URL est déjà une URL d'embed ou une URL non reconnue
    return this.videoUrl;
  }
  
  if (!this.videoId) return null;
  
  // Ajouter des paramètres pour améliorer l'expérience utilisateur
  switch (this.platform) {
    case 'YOUTUBE':
      return `https://www.youtube.com/embed/${this.videoId}?autoplay=0&rel=0&showinfo=1`;
    case 'VIMEO':
      return `https://player.vimeo.com/video/${this.videoId}?autoplay=0&title=1&byline=1&portrait=1`;
    case 'DAILYMOTION':
      return `https://www.dailymotion.com/embed/video/${this.videoId}?autoplay=0`;
    default:
      // Si c'est déjà une URL d'embed, la retourner telle quelle
      if (this.videoUrl.includes('embed') || this.videoUrl.includes('player')) {
        return this.videoUrl;
      }
      // Sinon, essayer de créer une iframe avec l'URL
      return this.videoUrl;
  }
};

// Vérification si un utilisateur a aimé ce podcast
podcastSchema.methods.isLikedByUser = function(userId) {
  if (!this.likes) return false;
  return this.likes.some(id => id.toString() === userId.toString());
};

// Ajouter un like d'utilisateur à ce podcast
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

// Retirer un like d'utilisateur de ce podcast
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

// Méthode pour récupérer l'URL de la thumbnail
podcastSchema.methods.getThumbnailUrl = function() {
  if (this.thumbnailUrl) {
    return this.thumbnailUrl;
  }
  
  if (this.coverImage && !this.coverImage.includes('podcast-default.jpg')) {
    return this.coverImage;
  }
  
  if (this.videoId) {
    return getThumbnailUrl(this.platform, this.videoId);
  }
  
  return '/images/podcast-default.jpg';
};

module.exports = model('Podcast', podcastSchema);