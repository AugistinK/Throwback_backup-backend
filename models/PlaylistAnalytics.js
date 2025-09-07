// models/PlaylistAnalytics.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Modèle pour les statistiques et analytics des playlists
 * Permet de suivre et d'analyser les performances des playlists
 */
const playlistAnalyticsSchema = new Schema({
  // Référence à la playlist
  playlist_id: {
    type: Schema.Types.ObjectId,
    ref: 'Playlist',
    required: true,
    index: true
  },
  
  // Statistiques de vues
  views: {
    total: { type: Number, default: 0 }, // Nombre total de vues
    daily: { type: Number, default: 0 }, // Vues au cours des dernières 24h
    weekly: { type: Number, default: 0 }, // Vues au cours des 7 derniers jours
    monthly: { type: Number, default: 0 } // Vues au cours des 30 derniers jours
  },
  
  // Statistiques de visiteurs uniques
  unique_viewers: {
    total: { type: Number, default: 0 },
    daily: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 }
  },
  
  // Statistiques de mises en favoris
  favorites: {
    total: { type: Number, default: 0 },
    daily: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 }
  },
  
  // Historique des vues (pour les graphiques)
  views_history: [{
    date: { type: Date, required: true },
    count: { type: Number, default: 0 }
  }],
  
  // Historique des mises en favoris (pour les graphiques)
  favorites_history: [{
    date: { type: Date, required: true },
    count: { type: Number, default: 0 }
  }],
  
  // Démographie des utilisateurs
  demographics: {
    age_groups: {
      under_18: { type: Number, default: 0 },
      _18_24: { type: Number, default: 0 },
      _25_34: { type: Number, default: 0 },
      _35_44: { type: Number, default: 0 },
      _45_54: { type: Number, default: 0 },
      _55_plus: { type: Number, default: 0 }
    },
    gender: {
      male: { type: Number, default: 0 },
      female: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    },
    countries: [{
      country: String,
      count: Number
    }]
  },
  
  // Comportement des utilisateurs
  engagement: {
    avg_time_spent: { type: Number, default: 0 }, // Temps moyen passé (secondes)
    completion_rate: { type: Number, default: 0 }, // Taux de complétion (%)
    skip_rate: { type: Number, default: 0 }, // Taux de saut de vidéos (%)
    repeat_rate: { type: Number, default: 0 } // Taux de répétition (%)
  },
  
  // Score de tendance (utilisé pour classer les playlists dans les tendances)
  trending_score: { type: Number, default: 0 },
  
  // Données de découverte
  discovery: {
    search: { type: Number, default: 0 }, // Nombre de fois trouvée via la recherche
    recommended: { type: Number, default: 0 }, // Nombre de fois recommandée
    shared: { type: Number, default: 0 }, // Nombre de fois partagée
    external: { type: Number, default: 0 } // Nombre de fois accédée depuis l'extérieur
  },
  
  // Date de la dernière mise à jour
  last_updated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index pour les requêtes courantes
playlistAnalyticsSchema.index({ 'trending_score': -1 });
playlistAnalyticsSchema.index({ 'views.total': -1 });
playlistAnalyticsSchema.index({ 'views.daily': -1 });
playlistAnalyticsSchema.index({ 'favorites.total': -1 });

// Méthode pour mettre à jour le score de tendance
playlistAnalyticsSchema.methods.updateTrendingScore = function() {
  // Formule de calcul du score de tendance
  // 40% des vues totales + 30% des vues quotidiennes + 20% des favoris totaux + 10% des favoris quotidiens
  this.trending_score = 
    (this.views.total * 0.4) + 
    (this.views.daily * 0.3) + 
    (this.favorites.total * 0.2) + 
    (this.favorites.daily * 0.1);
  
  this.last_updated = Date.now();
  return this.save();
};

// Méthode pour ajouter une entrée à l'historique des vues
playlistAnalyticsSchema.methods.addViewHistoryEntry = function(count = 1) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Vérifier si une entrée existe déjà pour aujourd'hui
  const existingEntry = this.views_history.find(entry => 
    entry.date.getTime() === today.getTime()
  );
  
  if (existingEntry) {
    existingEntry.count += count;
  } else {
    this.views_history.push({
      date: today,
      count: count
    });
  }
  
  // Limiter l'historique aux 90 derniers jours
  if (this.views_history.length > 90) {
    this.views_history.sort((a, b) => b.date - a.date);
    this.views_history = this.views_history.slice(0, 90);
  }
  
  return this;
};

// Méthode statique pour récupérer les playlists tendance
playlistAnalyticsSchema.statics.getTrendingPlaylists = function(limit = 10) {
  return this.find()
    .sort({ trending_score: -1 })
    .limit(limit)
    .populate('playlist_id', 'nom description visibilite image_couverture proprietaire');
};

// Méthode statique pour réinitialiser les compteurs quotidiens
playlistAnalyticsSchema.statics.resetDailyCounts = async function() {
  try {
    await this.updateMany({}, { 
      $set: { 
        'views.daily': 0, 
        'favorites.daily': 0,
        'unique_viewers.daily': 0
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

module.exports = model('PlaylistAnalytics', playlistAnalyticsSchema);