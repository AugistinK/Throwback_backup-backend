// models/LiveStream.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Schéma pour les vidéos compilées
const compilationVideoSchema = new Schema({
  sourceId: {
    type: String,
    required: true,
    trim: true
  },
  sourceType: {
    type: String,
    enum: ['YOUTUBE', 'VIMEO', 'DAILYMOTION'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  thumbnailUrl: {
    type: String
  },
  duration: {
    type: String
  },
  channel: {
    type: String
  },
  publishedAt: {
    type: Date
  },
  order: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number
  },
  likeCount: {
    type: Number
  },
  originalUrl: {
    type: String,
    trim: true
  }
});

const liveStreamSchema = new Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  scheduledStartTime: {
    type: Date,
    required: true
  },
  scheduledEndTime: {
    type: Date
  },
  actualStartTime: {
    type: Date
  },
  actualEndTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'],
    default: 'SCHEDULED'
  },
  streamKey: {
    type: String,
    required: true,
    unique: true
  },
  streamUrl: {
    type: String,
    required: true
  },
  playbackUrl: {
    type: String
  },
  embedCode: {
    type: String
  },
  thumbnailUrl: {
    type: String,
    default: '/images/live-default.jpg'
  },
  category: {
    type: String,
    enum: ['MUSIC_PERFORMANCE', 'TALK_SHOW', 'Q_AND_A', 'BEHIND_THE_SCENES', 'THROWBACK_SPECIAL', 'OTHER'],
    default: 'MUSIC_PERFORMANCE'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: { 
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'],
      default: 'WEEKLY'
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }],
    interval: {
      type: Number,
      default: 1
    },
    endDate: {
      type: Date
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  hostName: {
    type: String,
    default: 'ThrowBack Host'
  },
  guests: [{
    type: String,
    trim: true
  }],
  chatEnabled: {
    type: Boolean,
    default: true
  },
  moderationEnabled: {
    type: Boolean,
    default: true
  },
  visibilitySettings: {
    requireRegistration: {
      type: Boolean,
      default: false
    },
    allowedUserGroups: [{
      type: Schema.Types.ObjectId,
      ref: 'Group'
    }],
    restrictByCountry: {
      type: Boolean,
      default: false
    },
    allowedCountries: [{
      type: String,
      trim: true
    }]
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  statistics: {
    maxConcurrentViewers: {
      type: Number,
      default: 0
    },
    totalUniqueViewers: {
      type: Number,
      default: 0
    },
    totalViewDuration: {
      type: Number,
      default: 0
    },
    averageViewDuration: {
      type: Number,
      default: 0
    },
    chatMessages: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    }
  },
  streamProvider: {
    type: String,
    enum: ['VIMEO', 'YOUTUBE', 'CUSTOM'],
    default: 'VIMEO'
  },
  streamConfig: {
    resolution: {
      type: String,
      enum: ['720p', '1080p', '1440p', '4K'],
      default: '1080p'
    },
    frameRate: {
      type: Number,
      default: 30
    },
    bitrateKbps: {
      type: Number,
      default: 6000
    }
  },
  recordAfterStream: {
    type: Boolean,
    default: true
  },
  recordedVideoId: {
    type: String
  },
  // Nouveaux champs pour les compilations
  compilationType: {
    type: String,
    enum: ['DIRECT', 'VIDEO_COLLECTION'],
    default: 'DIRECT'
  },
  compilationVideos: [compilationVideoSchema],
  playbackConfig: {
    loop: {
      type: Boolean,
      default: true
    },
    autoplay: {
      type: Boolean,
      default: true
    },
    shuffle: {
      type: Boolean,
      default: false
    },
    transitionEffect: {
      type: String,
      enum: ['none', 'fade', 'slide', 'zoom', 'flip'],
      default: 'none'
    }
  },
  currentVideoIndex: {
    type: Number,
    default: 0
  },
  // Ajout du champ pour les utilisateurs bannis
  bannedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  versionKey: false
});

// Méthode pour générer une clé de stream unique
liveStreamSchema.statics.generateStreamKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'live_';
  for (let i = 0; i < 16; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

// Middleware pré-validation
liveStreamSchema.pre('validate', function(next) {
  // Vérifier que la date de fin programmée est après la date de début
  if (this.scheduledEndTime && this.scheduledStartTime) {
    if (this.scheduledEndTime <= this.scheduledStartTime) {
      this.invalidate('scheduledEndTime', 'La date de fin doit être postérieure à la date de début');
    }
  }
  
  // Si le stream est récurrent, valider le pattern de récurrence
  if (this.isRecurring) {
    if (!this.recurringPattern) {
      this.invalidate('recurringPattern', 'Le pattern de récurrence est requis pour un stream récurrent');
    } else if (this.recurringPattern.frequency === 'WEEKLY' && (!this.recurringPattern.daysOfWeek || this.recurringPattern.daysOfWeek.length === 0)) {
      this.invalidate('recurringPattern.daysOfWeek', 'Les jours de la semaine sont requis pour une récurrence hebdomadaire');
    }
  }

  next();
});

// Calcul de la durée prévue en minutes
liveStreamSchema.virtual('scheduledDuration').get(function() {
  if (!this.scheduledEndTime || !this.scheduledStartTime) return null;
  return Math.round((this.scheduledEndTime - this.scheduledStartTime) / (1000 * 60));
});

// Calcul de la durée réelle en minutes
liveStreamSchema.virtual('actualDuration').get(function() {
  if (!this.actualEndTime || !this.actualStartTime) return null;
  return Math.round((this.actualEndTime - this.actualStartTime) / (1000 * 60));
});

// Vérifie si le live est en cours
liveStreamSchema.virtual('isLive').get(function() {
  return this.status === 'LIVE';
});

// Vérifier si le live est terminé
liveStreamSchema.virtual('isCompleted').get(function() {
  return this.status === 'COMPLETED';
});

// Vérifier si le live est annulé
liveStreamSchema.virtual('isCancelled').get(function() {
  return this.status === 'CANCELLED';
});

// Vérifier si le live est programmé
liveStreamSchema.virtual('isScheduled').get(function() {
  return this.status === 'SCHEDULED';
});

// Vérifier si le live va commencer bientôt
liveStreamSchema.virtual('isStartingSoon').get(function() {
  if (!this.scheduledStartTime || this.status !== 'SCHEDULED') return false;
  const now = new Date();
  const timeDiff = this.scheduledStartTime - now;
  return timeDiff > 0 && timeDiff <= 30 * 60 * 1000; 
});

// Calculer la durée totale des vidéos dans la compilation
liveStreamSchema.virtual('totalCompilationDuration').get(function() {
  if (!this.compilationVideos || this.compilationVideos.length === 0) return 0;
  
  // Convertir les durées au format h:mm:ss en secondes
  let totalSeconds = 0;
  this.compilationVideos.forEach(video => {
    if (video.duration) {
      const parts = video.duration.split(':').map(part => parseInt(part));
      if (parts.length === 3) { 
        totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) { 
        totalSeconds += parts[0] * 60 + parts[1];
      } else if (parts.length === 1) { 
        totalSeconds += parts[0];
      }
    }
  });
  
  return totalSeconds;
});

// Inclure les virtuals par défaut dans les objets JSON
liveStreamSchema.set('toJSON', { virtuals: true });
liveStreamSchema.set('toObject', { virtuals: true });

module.exports = model('LiveStream', liveStreamSchema);