// services/playlistStatsService.js
const cron = require('node-cron');
const mongoose = require('mongoose');

// N'essayez pas d'accéder aux modèles directement au moment du chargement du fichier
// Nous les référencerons plus tard au moment de l'exécution
let Playlist, Video, User, PlaylistAnalytics;

// Fonction pour initialiser les références aux modèles quand c'est nécessaire
const initModels = () => {
  if (!Playlist) {
    try {
      Playlist = mongoose.model('Playlist');
      Video = mongoose.model('Video');
      User = mongoose.model('User');
    } catch (error) {
      console.error('❌ Erreur lors de l\'accès aux modèles:', error);
      throw new Error('Modèles non disponibles. Assurez-vous que les modèles sont chargés avant le service.');
    }
  }

  // Pour PlaylistAnalytics, essayons de le récupérer, et s'il n'existe pas, créons-le
  if (!PlaylistAnalytics) {
    try {
      PlaylistAnalytics = mongoose.model('PlaylistAnalytics');
    } catch (error) {
      // Si le modèle n'existe pas, on crée un schéma
      console.log('Création du modèle PlaylistAnalytics...');
      const playlistAnalyticsSchema = new mongoose.Schema({
        playlist_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Playlist',
          required: true
        },
        views: {
          total: { type: Number, default: 0 },
          daily: { type: Number, default: 0 },
          weekly: { type: Number, default: 0 },
          monthly: { type: Number, default: 0 }
        },
        unique_viewers: {
          total: { type: Number, default: 0 },
          daily: { type: Number, default: 0 },
          weekly: { type: Number, default: 0 },
          monthly: { type: Number, default: 0 }
        },
        favorites: {
          total: { type: Number, default: 0 },
          daily: { type: Number, default: 0 },
          weekly: { type: Number, default: 0 },
          monthly: { type: Number, default: 0 }
        },
        trending_score: { type: Number, default: 0 },
        last_updated: { type: Date, default: Date.now }
      }, {
        timestamps: true
      });
      
      PlaylistAnalytics = mongoose.model('PlaylistAnalytics', playlistAnalyticsSchema);
    }
  }
};

class PlaylistStatsService {
  constructor() {
    this.tasks = [];
    this.status = {
      isRunning: false,
      lastTrendingUpdate: null,
      lastViewsUpdate: null,
      lastRecommendationUpdate: null,
      errors: []
    };
    
    // On ne lance pas tout de suite les tâches
    // On les lancera plus tard pour s'assurer que les modèles sont chargés
  }
  
  // Méthode pour initialiser les tâches après que tous les modèles sont chargés
  start() {
    try {
      // Initialiser les références aux modèles
      initModels();
      
      // Maintenant on peut lancer les tâches
      this.initTasks();
      
      return true;
    } catch (error) {
      console.error('❌ Erreur lors du démarrage du service:', error);
      this.status.errors.push({
        time: new Date(),
        message: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  initTasks() {
    try {
      // Mise à jour des tendances toutes les 3 heures
      const trendingTask = cron.schedule('0 */3 * * *', async () => {
        console.log('🔄 Exécution de la tâche de mise à jour des tendances...');
        await this.updateTrendingPlaylists();
        this.status.lastTrendingUpdate = new Date();
      });
      
      // Mise à jour des compteurs de lectures toutes les 30 minutes
      const viewsTask = cron.schedule('*/30 * * * *', async () => {
        console.log('🔄 Exécution de la tâche de mise à jour des compteurs de lectures...');
        await this.updatePlaylistViews();
        this.status.lastViewsUpdate = new Date();
      });
      
      // Génération des recommandations tous les jours à 4h00
      const recommendationsTask = cron.schedule('0 4 * * *', async () => {
        console.log('🔄 Exécution de la tâche de génération des recommandations...');
        await this.generateRecommendations();
        this.status.lastRecommendationUpdate = new Date();
      });
      
      this.tasks.push(trendingTask, viewsTask, recommendationsTask);
      this.status.isRunning = true;
      
      console.log('✅ Service de statistiques des playlists initialisé avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation des tâches:', error);
      this.status.errors.push({
        time: new Date(),
        message: error.message,
        stack: error.stack
      });
      this.status.isRunning = false;
    }
  }
  
  async updateTrendingPlaylists() {
    try {
      // S'assurer que les modèles sont initialisés
      initModels();
      
      // Récupérer toutes les playlists publiques
      const playlists = await Playlist.find({ visibilite: 'PUBLIC' })
        .select('_id nom nb_lectures nb_favoris');
      
      console.log(`📊 Mise à jour des tendances pour ${playlists.length} playlists...`);
      
      for (const playlist of playlists) {
        // Récupérer les analytics existantes ou en créer de nouvelles
        let analytics = await PlaylistAnalytics.findOne({ playlist_id: playlist._id });
        
        if (!analytics) {
          analytics = new PlaylistAnalytics({
            playlist_id: playlist._id,
            views: { total: playlist.nb_lectures || 0 },
            favorites: { total: playlist.nb_favoris || 0 }
          });
        }
        
        // Calculer le score de tendance
        // Le score est basé sur:
        // - 40% des vues totales
        // - 30% des vues quotidiennes
        // - 20% des favoris totaux
        // - 10% des favoris quotidiens
        const trendingScore = 
          (analytics.views.total * 0.4) + 
          (analytics.views.daily * 0.3) + 
          (analytics.favorites.total * 0.2) + 
          (analytics.favorites.daily * 0.1);
        
        analytics.trending_score = trendingScore;
        analytics.last_updated = new Date();
        
        await analytics.save();
      }
      
      console.log('✅ Mise à jour des tendances terminée');
      return { success: true, count: playlists.length };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des tendances:', error);
      this.status.errors.push({
        time: new Date(),
        task: 'updateTrendingPlaylists',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }
  
  async updatePlaylistViews() {
    try {
      // S'assurer que les modèles sont initialisés
      initModels();
      
      // Simuler la mise à jour des compteurs de lectures
      // Dans un cas réel, on récupérerait les données d'un système de tracking
      console.log('📊 Mise à jour des compteurs de lectures...');
      
      // Pour chaque playlist publique, simuler des vues
      const playlists = await Playlist.find({ visibilite: 'PUBLIC' });
      let updatedCount = 0;
      
      for (const playlist of playlists) {
        // Récupérer ou créer les analytics
        let analytics = await PlaylistAnalytics.findOne({ playlist_id: playlist._id });
        
        if (!analytics) {
          analytics = new PlaylistAnalytics({
            playlist_id: playlist._id,
            views: { 
              total: playlist.nb_lectures || 0,
              daily: 0,
              weekly: 0,
              monthly: 0
            },
            favorites: { 
              total: playlist.nb_favoris || 0,
              daily: 0,
              weekly: 0,
              monthly: 0
            }
          });
        }
        
        // Simuler des vues aléatoires (1 à 10)
        const newViews = Math.floor(Math.random() * 10) + 1;
        
        // Mettre à jour les compteurs
        analytics.views.total += newViews;
        analytics.views.daily += newViews;
        analytics.views.weekly += newViews;
        analytics.views.monthly += newViews;
        analytics.last_updated = new Date();
        
        await analytics.save();
        
        // Mettre à jour la playlist également
        await Playlist.updateOne(
          { _id: playlist._id },
          { $set: { nb_lectures: analytics.views.total } }
        );
        
        updatedCount++;
      }
      
      console.log(`✅ Mise à jour des compteurs terminée pour ${updatedCount} playlists`);
      return { success: true, count: updatedCount };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des compteurs:', error);
      this.status.errors.push({
        time: new Date(),
        task: 'updatePlaylistViews',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }
  
  async generateRecommendations() {
    try {
      // S'assurer que les modèles sont initialisés
      initModels();
      
      console.log('🧠 Génération des recommandations de playlists...');
      
      // Dans un système réel, on utiliserait un algorithme de recommandation plus sophistiqué
      // basé sur les préférences des utilisateurs, l'historique d'écoute, etc.
      
      // Pour cette démonstration, on va simplement récupérer les playlists les plus populaires
      // et les associer à des utilisateurs aléatoires
      
      // Récupérer les playlists les plus populaires
      const popularPlaylists = await PlaylistAnalytics.find()
        .sort({ trending_score: -1 })
        .limit(20)
        .populate('playlist_id', 'nom visibilite type_playlist');
      
      // Récupérer des utilisateurs aléatoires
      const users = await User.find()
        .limit(50)
        .select('_id');
      
      console.log(`📊 Génération de recommandations avec ${popularPlaylists.length} playlists populaires pour ${users.length} utilisateurs...`);
      
      // Pour chaque utilisateur, attribuer 3-5 playlists recommandées
      let totalRecommendations = 0;
      
      // Dans un système réel, ces recommandations seraient stockées dans une collection dédiée
      // et accessibles via une API pour affichage dans l'interface utilisateur
      
      console.log(`✅ Génération de ${totalRecommendations} recommandations terminée`);
      return { success: true, count: totalRecommendations };
    } catch (error) {
      console.error('❌ Erreur lors de la génération des recommandations:', error);
      this.status.errors.push({
        time: new Date(),
        task: 'generateRecommendations',
        message: error.message
      });
      return { success: false, error: error.message };
    }
  }
  
  async runManualTrendingUpdate() {
    console.log('🔄 Exécution manuelle de la mise à jour des tendances...');
    const result = await this.updateTrendingPlaylists();
    this.status.lastTrendingUpdate = new Date();
    return result;
  }
  
  async runManualViewsUpdate() {
    console.log('🔄 Exécution manuelle de la mise à jour des compteurs de lectures...');
    const result = await this.updatePlaylistViews();
    this.status.lastViewsUpdate = new Date();
    return result;
  }
  
  healthCheck() {
    const now = new Date();
    const oneHourAgo = new Date(now - 3600000);
    const oneDayAgo = new Date(now - 86400000);
    
    // Vérifier si les mises à jour récentes ont été effectuées
    const trendingOk = this.status.lastTrendingUpdate && this.status.lastTrendingUpdate > oneDayAgo;
    const viewsOk = this.status.lastViewsUpdate && this.status.lastViewsUpdate > oneHourAgo;
    
    // Vérifier s'il y a eu des erreurs récentes
    const recentErrors = this.status.errors.filter(e => e.time > oneHourAgo).length;
    
    let status = 'healthy';
    if (recentErrors > 0) {
      status = recentErrors > 3 ? 'error' : 'warning';
    } else if (!trendingOk || !viewsOk) {
      status = 'warning';
    }
    
    return {
      status,
      lastTrendingUpdate: this.status.lastTrendingUpdate,
      lastViewsUpdate: this.status.lastViewsUpdate,
      lastRecommendationUpdate: this.status.lastRecommendationUpdate,
      recentErrors,
      isRunning: this.status.isRunning
    };
  }
  
  shutdown() {
    console.log('🛑 Arrêt du service de statistiques des playlists...');
    
    // Arrêter toutes les tâches programmées
    this.tasks.forEach(task => {
      if (task) {
        task.stop();
      }
    });
    
    this.status.isRunning = false;
    console.log('✅ Service de statistiques des playlists arrêté');
  }
}

// Singleton
let playlistStatsService = null;

// Fonction d'initialisation
function initPlaylistStatsService() {
  if (!playlistStatsService) {
    playlistStatsService = new PlaylistStatsService();
  }
  return playlistStatsService;
}

module.exports = {
  initPlaylistStatsService
};