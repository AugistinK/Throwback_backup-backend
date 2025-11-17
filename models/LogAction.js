// models/LogAction.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const logActionSchema = new Schema(
  {
    type_action: {
      type: String,
      required: true,
      enum: [
        'INSCRIPTION',
        'CONNEXION',
        'VIDEO_LIKED',
        'VIDEO_UNLIKEE',
        'VIDEO_LIKEE',
        'MEMOIRE_SUPPRIMEE',
        'REPONSE_AJOUTEE',
        'MEMOIRE_SIGNALEE',
        'MEMOIRE_AJOUTEE',
        'PLAYLIST_CREEE',
        'VIDEO_AJOUTEE_PLAYLIST',
        'VIDEO_SUPPRIMEE_PLAYLIST',
        'PLAYLIST_MODIFIEE',
        'PLAYLIST_SUPPRIMEE',
        'PLAYLIST_FAVORIS',
        'CREATION_PODCAST',
        'SUPPRESSION_PODCAST',
        'MODIFICATION_PODCAST',
        'CREATION_LIVESTREAM',
        'MODIFICATION_LIVESTREAM',
        'SUPPRESSION_LIVESTREAM',
        'DEMARRAGE_LIVESTREAM',
        'FIN_LIVESTREAM',
        'ANNULATION_LIVESTREAM',
        'VIEW_LIVESTREAMS',
        'VIDEO_VIEW',
        'COMMENT_LIVESTREAM',
        'LIKE_LIVESTREAM',
        'VIEW_LIVESTREAMS',
        'VIEW_LIVESTREAM',
        'VIEW_LIVESTREAM_COMMENTS',
        'DECONNEXION',
        'CREATE_VIDEO',
        'MODIFICATION_STATUT',
        'UPDATE_VIDEO',
        'PODCAST_LIKED',
        'MODIFICATION_UTILISATEUR',
        'DELETE_VIDEO',
        'UNLIKE_PODCAST',
        'VIEW_LIVESTREAM_CHAT',
        'MODIFICATION_PLAYLIST',
        'AJOUT_VIDEO_PLAYLIST',
        'SUPPRESSION_VIDEO_PLAYLIST',
        'REORDONNANCEMENT_PLAYLIST',
        'GESTION_COLLABORATEURS_PLAYLIST',
        'PLAYLIST_PARTAGEE',
        'SUPPRESSION_PLAYLIST',
        'MODIFICATION_PLAYLIST',
        'MEMOIRE_SIGNALEE',
        'REPONSE_AJOUTEE',
        'MEMOIRE_SUPPRIMEE',
        'CREATION_POST',
        'MODIFICATION_POST',
        'SUPPRESSION_POST',
        'LIKE_POST',
        'PARTAGE_POST',
        'SIGNALEMENT_POST',
        'AJOUT_COMMENTAIRE',
        'POST_COMMENT_ADDED',
        'COMMENT_REPORTED',
        'AJOUT_COMMENTAIRE_POST',
        'COMMENT_ADDED',
        'LIKE_COMMENTAIRE',
        'DISLIKE_COMMENTAIRE',
        'SUPPRESSION_COMMENTAIRE',
        'MODIFICATION_COMMENTAIRE',
        'SIGNALEMENT_COMMENTAIRE',
        'LIKE_PODCAST',
        'SUPPRESSION_UTILISATEUR',
        'AUTO_START_LIVESTREAM',
        'REMOVE_BOOKMARK_PODCAST',
        'SUPPRESSION_COMMENTAIRE',
        'ADD_PODCAST_MEMORY',
        'AUTO_END_LIVESTREAM',
        'ADD_PODCAST_TO_PLAYLIST',
        'SHARE_PODCAST',
        'ADD_BOOKMARK_PODCAST',
        'CREATE_PLAYLIST',
        'EMAIL_VERIFIE',
        'DEMANDE_REINITIALISATION_MDP',
        'MOT_DE_PASSE_REINITIALISE',
        'MOT_DE_PASSE_MODIFIE',
        'COMPTE_VERROUILLE',
        'COMPTE_DEVERROUILLE',
        'PROFIL_MODIFIE',
        'COMPTE_SUPPRIME',
        'UPLOAD_PHOTO_PROFIL',
        'UPLOAD_PHOTO_COUVERTURE',
        'SUPPRESSION_PHOTO_PROFIL',
        'SUPPRESSION_PHOTO_COUVERTURE',
        'MODIFICATION_PROFIL',
        'MISE_A_JOUR_PREFERENCES',
        'PREFERENCES_MODIFIEES',
        'MODERATION_POST_ADMIN',
        'RESTAURATION_POST_ADMIN',
        'SUPPRESSION_DEFINITIVE_POST',
        'ACTION_MASSE_POSTS',
        'SUPPRESSION_COMMENTAIRE_ADMIN',
        'MODERATION_COMMENTAIRE_ADMIN',
        'RESTAURATION_COMMENTAIRE_ADMIN',
        'REJET_SIGNALEMENTS_POST',
        'SUPPRESSION_POST_ADMIN',
        'MODERATION_MASSE_POSTS',
        'MODERATION_POST',
        'RESTAURATION_POST',
        'RESTAURATION_MASSE_POSTS',
        'SUPPRESSION_MASSE_POSTS',
        'SUPPRESSION_POST_ADMIN',
        'REPONSE_ADMIN_COMMENTAIRE',
        'MODERATION_COMMENTAIRE_LOT',
        'MODERATION_COMMENTAIRE',
        'MODERATION_COMMENTAIRE_ADMIN',
        'REPONSE_COMMENTAIRE_ADMIN',
        'MODERATION_MASSE_COMMENTAIRES',
        'REJET_SIGNALEMENTS_COMMENTAIRE',
        'SUPPRESSION_COLLABORATEUR_PLAYLIST',
        'AJOUT_COLLABORATEUR_PLAYLIST',
        'FRIEND_GROUP_CREATED',
        'FRIEND_GROUP_UPDATED',
        'FRIEND_GROUP_DELETED',
        'FRIEND_REMOVED',
        'FRIEND_REQUEST_SENT',
        'FRIEND_REQUEST_ACCEPTED',
        'FRIEND_REQUEST_REJECTED',
        'FRIEND_REQUEST_SENT',
        'CHAT_ARCHIVED',
        'CHAT_HISTORY_CLEARED',
        'USER_REPORTED',
        'FRIEND_REMOVED',
        'GROUP_CREATED',
        'GROUP_MESSAGE_SENT',
        'ADMIN_FRIENDSHIP_DELETED',
        'ADMIN_MESSAGE_DELETED',
        'ADMIN_REPORT_UPDATED'
      ]
    },
    description_action: {
      type: String,
      required: true
    },
    id_user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    ip_address: String,
    user_agent: String,
    created_by: {
      type: String,
      default: 'SYSTEM'
    },
    donnees_supplementaires: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: { createdAt: 'date_action', updatedAt: false },
    versionKey: false
  }
);

// Middleware post-save pour créer des notifications admin à partir de certains logs
logActionSchema.post('save', function (doc, next) {
  // Types d’actions qui doivent générer une notification pour les administrateurs
  const ADMIN_NOTIFICATION_TYPES = [
    'USER_REPORTED',
    'COMMENT_REPORTED',
    'SIGNALEMENT_POST',
    'MEMOIRE_SIGNALEE',
    'ADMIN_FRIENDSHIP_DELETED',
    'ADMIN_MESSAGE_DELETED',
    'ADMIN_REPORT_UPDATED'
  ];

  if (!ADMIN_NOTIFICATION_TYPES.includes(doc.type_action)) {
    return next();
  }

  // On exécute la logique de notification de façon asynchrone sans bloquer la requête principale
  (async () => {
    try {
      const User = require('./User');
      const { createNotification } = require('../services/notificationService');

      // Récupérer tous les utilisateurs admins / superadmins
      const admins = await User.find({
        role: { $in: ['admin', 'superadmin'] }
      }).select('_id');

      if (!admins || admins.length === 0) {
        return;
      }

      // Déterminer un titre / type génériques
      let title = 'Nouvel évènement de modération';
      let notifType = 'system';
      let link = '/admin/logs';

      switch (doc.type_action) {
        case 'USER_REPORTED':
          title = 'Nouvel utilisateur signalé';
          break;
        case 'COMMENT_REPORTED':
        case 'SIGNALEMENT_COMMENTAIRE':
          title = 'Nouveau commentaire signalé';
          break;
        case 'SIGNALEMENT_POST':
          title = 'Nouveau post signalé';
          break;
        case 'MEMOIRE_SIGNALEE':
          title = 'Nouvelle mémoire signalée';
          break;
        case 'ADMIN_FRIENDSHIP_DELETED':
        case 'ADMIN_MESSAGE_DELETED':
        case 'ADMIN_REPORT_UPDATED':
          title = 'Action d’administration effectuée';
          break;
        default:
          break;
      }

      const message =
        doc.description_action ||
        `Un évènement "${doc.type_action}" a été enregistré dans les logs.`;

      // Créer une notification pour chaque admin
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin._id,
            type: notifType,
            title,
            message,
            link,
            actorId: doc.id_user || null,
            metadata: {
              logId: doc._id,
              type_action: doc.type_action
            }
          })
        )
      );
    } catch (err) {
      console.error(
        'Erreur lors de la création de la notification admin depuis LogAction:',
        err.message
      );
    }
  })();

  next();
});

// Index pour optimiser les requêtes
logActionSchema.index({ type_action: 1 });
logActionSchema.index({ id_user: 1 });
logActionSchema.index({ date_action: -1 });
logActionSchema.index({ ip_address: 1 });

module.exports = model('LogAction', logActionSchema);
