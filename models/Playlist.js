

// models/Playlist.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const playlistSchema = new Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Propriétaire de la playlist
  proprietaire: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Vidéos dans la playlist avec ordre
  videos: [{
    video_id: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
      required: true
    },
    ordre: {
      type: Number,
      required: true
    },
    date_ajout: {
      type: Date,
      default: Date.now
    },
    ajoute_par: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Paramètres de visibilité
  visibilite: {
    type: String,
    enum: ['PUBLIC', 'PRIVE', 'AMIS'],
    default: 'PUBLIC'
  },
  
  // Collaboration
  collaborateurs: [{
    utilisateur: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['LECTURE', 'AJOUT', 'MODIFICATION'],
      default: 'LECTURE'
    },
    date_ajout: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Image de couverture
  image_couverture: String,
  
  // Statistiques
  nb_lectures: {
    type: Number,
    default: 0
  },
  
  nb_favoris: {
    type: Number,
    default: 0
  },
  
  favori_par: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Tags pour la recherche
  tags: [String],
  
  // Playlist générée automatiquement ou créée manuellement
  type_playlist: {
    type: String,
    enum: ['MANUELLE', 'AUTO_GENRE', 'AUTO_DECENNIE', 'AUTO_ARTISTE'],
    default: 'MANUELLE'
  },
  
  // Critères pour les playlists automatiques
  criteres_auto: {
    genre: String,
    decennie: String,
    artiste: String,
    limite: { type: Number, default: 50 }
  },
  
  // Metadata
  created_by: { type: String, default: 'SYSTEM' },
  modified_by: { type: Schema.Types.ObjectId, ref: 'User' },
  modified_date: Date
}, {
  timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
  versionKey: false
});

// Index pour les requêtes courantes
playlistSchema.index({ proprietaire: 1, creation_date: -1 });
playlistSchema.index({ visibilite: 1, creation_date: -1 });
playlistSchema.index({ tags: 1 });
playlistSchema.index({ 'videos.video_id': 1 });

// Virtuel pour compter le nombre de vidéos
playlistSchema.virtual('nb_videos').get(function() {
  return this.videos.length;
});

// Méthode pour ajouter une vidéo
playlistSchema.methods.ajouterVideo = function(videoId, userId) {
  const ordre = this.videos.length + 1;
  this.videos.push({
    video_id: videoId,
    ordre: ordre,
    ajoute_par: userId
  });
  return this.save();
};

// Méthode pour supprimer une vidéo
playlistSchema.methods.supprimerVideo = function(videoId) {
  this.videos = this.videos.filter(v => !v.video_id.equals(videoId));
  // Réorganiser les ordres
  this.videos.forEach((video, index) => {
    video.ordre = index + 1;
  });
  return this.save();
};

// Méthode pour réorganiser les vidéos
playlistSchema.methods.reorganiserVideos = function(nouveauOrdre) {
  nouveauOrdre.forEach((item, index) => {
    const video = this.videos.find(v => v.video_id.equals(item.videoId));
    if (video) {
      video.ordre = index + 1;
    }
  });
  this.videos.sort((a, b) => a.ordre - b.ordre);
  return this.save();
};


// Middleware pour mettre à jour automatiquement le nombre de favoris quand la liste favori_par change
playlistSchema.pre('save', function(next) {
  if (this.isModified('favori_par')) {
    this.nb_favoris = this.favori_par.length;
  }
  
  // Générer automatiquement une image de couverture si non définie
  if (!this.image_couverture && this.videos && this.videos.length > 0) {
    // Vous pourriez implémenter ici une logique pour utiliser la première vidéo comme couverture
    // Par exemple, extraire une miniature de la première vidéo
    // Cela nécessitera peut-être une requête pour obtenir les détails de la vidéo
  }
  
  next();
});

// Méthode pour vérifier si un utilisateur est collaborateur
playlistSchema.methods.isCollaborator = function(userId) {
  return this.collaborateurs.some(collab => 
    collab.utilisateur.toString() === userId.toString()
  );
};

// Méthode pour vérifier les permissions d'un collaborateur
playlistSchema.methods.hasPermission = function(userId, permission) {
  // Le propriétaire a toutes les permissions
  if (this.proprietaire.toString() === userId.toString()) {
    return true;
  }
  
  const collaborateur = this.collaborateurs.find(
    collab => collab.utilisateur.toString() === userId.toString()
  );
  
  // Vérifier si le collaborateur a la permission spécifiée
  return collaborateur && collaborateur.permissions === permission;
};

// Méthode pour ajouter un collaborateur
playlistSchema.methods.ajouterCollaborateur = function(userId, permission = 'LECTURE') {
  // Vérifier si l'utilisateur est déjà collaborateur
  const existingIndex = this.collaborateurs.findIndex(
    collab => collab.utilisateur.toString() === userId.toString()
  );
  
  if (existingIndex >= 0) {
    // Mettre à jour la permission si l'utilisateur est déjà collaborateur
    this.collaborateurs[existingIndex].permissions = permission;
  } else {
    // Ajouter un nouveau collaborateur
    this.collaborateurs.push({
      utilisateur: userId,
      permissions: permission,
      date_ajout: new Date()
    });
  }
  
  return this.save();
};

// Méthode pour supprimer un collaborateur
playlistSchema.methods.supprimerCollaborateur = function(userId) {
  this.collaborateurs = this.collaborateurs.filter(
    collab => !collab.utilisateur.toString() === userId.toString()
  );
  
  return this.save();
};

// Méthode pour incrémenter le compteur de lectures
playlistSchema.methods.incrementerLectures = function() {
  this.nb_lectures += 1;
  return this.save();
};

// Méthode pour basculer une playlist dans les favoris d'un utilisateur
playlistSchema.methods.toggleFavori = function(userId) {
  const isFavorite = this.favori_par.some(id => id.toString() === userId.toString());
  
  if (isFavorite) {
    this.favori_par = this.favori_par.filter(id => id.toString() !== userId.toString());
  } else {
    this.favori_par.push(userId);
  }
  
  return this.save();
};

module.exports = model('Playlist', playlistSchema);