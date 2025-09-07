// models/Video.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Liste des genres musicaux possibles
const GENRES = [
    'Pop', 'Rock', 'Hip-Hop', 'Rap', 'R&B', 'Soul', 'Jazz', 'Blues', 'Electronic', 
    'Dance', 'House', 'Techno', 'Country', 'Folk', 'Classical', 'Opera', 'Reggae', 'Latin', 
    'World', 'Afro', 'Alternative', 'Indie', 'Metal', 'Punk', 'Gospel', 'Funk', 'Disco', 
    'Ska', 'Salsa', 'Bachata', 'Merengue', 'Tango', 'Other'
];

const videoSchema = new Schema({
  titre: { type: String, required: true },
  youtubeUrl: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['short', 'music'], 
    required: true 
  },
  genre: { 
    type: String, 
    enum: GENRES,
    index: true // Index pour de meilleures performances de recherche
  },
  duree: { type: Number },    
  description: String,
  artiste: String,
  auteur: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  annee: { type: Number },
  decennie: { 
    type: String, 
    enum: ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'],
    index: true
  },
  vues: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  // Métadonnées pour l'intégration sociale
  meta: {
    // ID des utilisateurs qui ont mis en favoris cette vidéo (pour remplissage ultérieur)
    favorisBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // ID des playlists qui contiennent cette vidéo (pour remplissage ultérieur)
    playlists: [{ type: Schema.Types.ObjectId, ref: 'Playlist' }],
    // Nombre de commentaires (à mettre à jour lors de l'ajout/suppression de commentaires)
    commentCount: { type: Number, default: 0 },
    // Tags pour la recherche
    tags: [String]
  }
}, {
  timestamps: true,
  versionKey: false
});

// Validation pour les shorts
videoSchema.pre('validate', function(next) {
  if (this.type === 'short') {
    if ((this.duree == null || this.duree === '') && !this._skipDureeValidation) {
      this.invalidate('duree', 'La durée est requise pour un short.');
    } else if (this.duree && (this.duree < 10 || this.duree > 45)) {
      this.invalidate('duree', 'La durée d\'un short doit être comprise entre 10 et 30 secondes.');
    }
  }
  next();
});

// Hook pour remplir l'année et calculer la décennie
videoSchema.pre('save', function(next) {
  // Définir l'année si elle n'est pas déjà définie
  if (!this.annee && this.createdAt) {
    this.annee = this.createdAt.getFullYear();
  }
  
  // Calculer la décennie en fonction de l'année si décennie non définie
  if (this.annee && (!this.decennie || this.isModified('annee'))) {
    const year = this.annee;
    if (year >= 1960 && year <= 1969) this.decennie = '60s';
    else if (year >= 1970 && year <= 1979) this.decennie = '70s';
    else if (year >= 1980 && year <= 1989) this.decennie = '80s';
    else if (year >= 1990 && year <= 1999) this.decennie = '90s';
    else if (year >= 2000 && year <= 2009) this.decennie = '2000s';
    else if (year >= 2010 && year <= 2019) this.decennie = '2010s';
    else if (year >= 2020 && year <= 2029) this.decennie = '2020s';
  }
  
  // Initialiser les champs de méta-données si nécessaire
  if (!this.meta) {
    this.meta = {
      favorisBy: [],
      playlists: [],
      commentCount: 0,
      tags: []
    };
  }
  
  // Générer des tags de recherche à partir du titre, de l'artiste et du genre
  if (this.isModified('titre') || this.isModified('artiste') || this.isModified('genre')) {
    this.meta.tags = [];
    
    // Ajouter le titre aux tags
    if (this.titre) {
      this.meta.tags.push(...this.titre.toLowerCase().split(' '));
    }
    
    // Ajouter l'artiste aux tags
    if (this.artiste) {
      this.meta.tags.push(...this.artiste.toLowerCase().split(' '));
    }
    
    // Ajouter le genre aux tags
    if (this.genre) {
      this.meta.tags.push(this.genre.toLowerCase());
    }
    
    // Filtrer les tags vides et les doublons
    this.meta.tags = [...new Set(this.meta.tags.filter(tag => tag.length > 2))];
  }
  
  next();
});

// Exporter les genres pour utilisation dans d'autres parties de l'application
videoSchema.statics.GENRES = GENRES;

module.exports = model('Video', videoSchema);