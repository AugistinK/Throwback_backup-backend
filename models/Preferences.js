// models/Preferences.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const preferencesSchema = new Schema(
  {
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      unique: true 
    },
    // Préférences musicales
    genres_preferes: [{ 
      type: String,
      enum: ['rock', 'pop', 'jazz', 'classique', 'hip-hop', 'rap', 'r&b', 'soul', 'funk', 
             'disco', 'electro', 'house', 'techno', 'reggae', 'country', 'folk', 'metal', 
             'punk', 'blues', 'world']
    }],
    decennies_preferees: [{ 
      type: String,
      enum: ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s']
    }],
    artistes_preferes: [String],
    
    // Préférences de notification
    notif_nouveaux_amis: { type: Boolean, default: true },
    notif_messages: { type: Boolean, default: true },
    notif_commentaires: { type: Boolean, default: true },
    notif_mentions: { type: Boolean, default: true },
    notif_evenements: { type: Boolean, default: true },
    notif_recommendations: { type: Boolean, default: true },
    notif_email: { type: Boolean, default: true },
    notif_push: { type: Boolean, default: true },
    
    // Préférences de confidentialité
    qui_peut_voir_mes_playlists: { 
      type: String, 
      enum: ['public', 'amis', 'prive'],
      default: 'public'
    },
    qui_peut_voir_mon_activite: { 
      type: String, 
      enum: ['public', 'amis', 'prive'],
      default: 'public'
    },
    partage_automatique: { type: Boolean, default: false },
    autoriser_suggestions_amis: { type: Boolean, default: true },
    
    // Préférences d'affichage
    langue: { 
      type: String, 
      enum: ['fr', 'en', 'es', 'de', 'it'],
      default: 'fr'
    },
    theme: { 
      type: String, 
      enum: ['clair', 'sombre', 'auto'],
      default: 'auto'
    },
    
    created_by: { type: String, default: 'SYSTEM' },
    modified_by: String
  },
  {
    timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
    versionKey: false
  }
);

module.exports = model('Preferences', preferencesSchema);