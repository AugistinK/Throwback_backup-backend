// models/LogAction.js - VERSION CORRIGÉE
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
        'REPONSE_ADMIN_COMMENTAIRE',
        'MODERATION_COMMENTAIRE_LOT',
        'MODERATION_COMMENTAIRE',
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
        'CHAT_ARCHIVED',
        'CHAT_HISTORY_CLEARED',
        'USER_REPORTED',
        'GROUP_CREATED',
        'GROUP_MESSAGE_SENT',
        'ADMIN_FRIENDSHIP_DELETED',
        'ADMIN_MESSAGE_DELETED',
        'ADMIN_REPORT_UPDATED',
      ],
    },
    description_action: {
      type: String,
      required: true,
    },
    id_user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    ip_address: String,
    user_agent: String,
    created_by: {
      type: String,
      default: 'SYSTEM',
    },
    donnees_supplementaires: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: 'date_action', updatedAt: false },
    versionKey: false,
  }
);

/**
 * 🔔 Hook post-save : créer des notifications pour les admins
 */
logActionSchema.post('save', function (doc, next) {
  // Exécution asynchrone sans bloquer
  (async () => {
    try {
      const User = require('./User');
      const Role = require('./Role');
      const { createNotification } = require('../services/notificationService');
      const { emitNotificationToAdmins } = require('../socket/socketHandler');

      // Types de logs qui génèrent des notifications admin
      const ADMIN_NOTIFICATION_TYPES = [
        'CREATION_POST',
        'SIGNALEMENT_POST',
        'COMMENT_REPORTED',
        'SIGNALEMENT_COMMENTAIRE',
        'MEMOIRE_SIGNALEE',
        'USER_REPORTED',
        'FRIEND_REQUEST_SENT',
        'FRIEND_REQUEST_ACCEPTED',
        'FRIEND_REMOVED',
        'GROUP_CREATED',
        'GROUP_MESSAGE_SENT',
        'ADMIN_FRIENDSHIP_DELETED',
        'ADMIN_MESSAGE_DELETED',
        'ADMIN_REPORT_UPDATED',
      ];

      if (!ADMIN_NOTIFICATION_TYPES.includes(doc.type_action)) {
        return;
      }

      // 🔥 CORRECTION : Chercher les rôles admin/superadmin
      const adminRoles = await Role.find({
        libelle_role: { $in: ['admin', 'superadmin'] }
      }).select('_id');

      if (!adminRoles || adminRoles.length === 0) {
        console.log('⚠️ Aucun rôle admin trouvé');
        return;
      }

      const adminRoleIds = adminRoles.map(r => r._id);

      // 🔥 CORRECTION : Chercher les users qui ont ces rôles
      // Supporte DEUX cas : role (string) ET roles (array)
      const admins = await User.find({
        $or: [
          { role: { $in: ['admin', 'superadmin'] } },
          { roles: { $in: adminRoleIds } }
        ]
      }).select('_id');

      if (!admins || admins.length === 0) {
        console.log('⚠️ Aucun administrateur trouvé');
        return;
      }

      // Générer un titre lisible
      const humanType = doc.type_action.replace(/_/g, ' ').toLowerCase();
      let title = `Nouvelle action : ${humanType}`;
      
      switch (doc.type_action) {
        case 'CREATION_POST':
          title = "Création d'un post";
          break;
        case 'SIGNALEMENT_POST':
          title = 'Post signalé';
          break;
        case 'COMMENT_REPORTED':
        case 'SIGNALEMENT_COMMENTAIRE':
          title = 'Commentaire signalé';
          break;
        case 'MEMOIRE_SIGNALEE':
          title = 'Mémoire signalée';
          break;
        case 'USER_REPORTED':
          title = 'Utilisateur signalé';
          break;
        case 'FRIEND_REQUEST_SENT':
          title = 'Nouvelle demande d\'ami';
          break;
        case 'GROUP_CREATED':
          title = 'Nouveau groupe créé';
          break;
      }

      const message = doc.description_action || `Une action "${doc.type_action}" a été enregistrée.`;

      // Conversion du Map en objet
      let extra = {};
      if (doc.donnees_supplementaires && doc.donnees_supplementaires.size > 0) {
        extra = Object.fromEntries(doc.donnees_supplementaires);
      }

      // Créer une notification pour chaque admin
      const notifications = await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin._id.toString(),
            type: 'system',
            title,
            message,
            link: '/admin/logs',
            actorId: doc.id_user ? doc.id_user.toString() : null,
            metadata: {
              logId: doc._id.toString(),
              type_action: doc.type_action,
              ...extra,
            },
          })
        )
      );

      // 🔥 ÉMISSION Socket.IO en temps réel
      if (notifications.length > 0) {
        const notificationData = {
          id: notifications[0]._id.toString(),
          type: notifications[0].type,
          title: notifications[0].title,
          message: notifications[0].message,
          link: notifications[0].link,
          read: false,
          createdAt: notifications[0].createdAt,
          actor: notifications[0].actor,
          metadata: notifications[0].metadata || {},
        };

        // Émettre à tous les admins connectés
        emitNotificationToAdmins(notificationData);
        
        console.log(`✅ Notification admin créée et émise : ${title}`);
      }

    } catch (err) {
      console.error('❌ Erreur création notification admin:', err.message);
    }
  })();

  if (typeof next === 'function') {
    next();
  }
});

// Index pour optimiser les requêtes
logActionSchema.index({ type_action: 1 });
logActionSchema.index({ id_user: 1 });
logActionSchema.index({ date_action: -1 });
logActionSchema.index({ ip_address: 1 });

module.exports = model('LogAction', logActionSchema);