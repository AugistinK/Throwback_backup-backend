// models/Report.js 
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const RESOLUTION_ENUM = [
  'no_action',
  'warning',
  'temporary_ban',
  'permanent_ban',
  'deleted_content'
];

const STATUS_ENUM = ['pending', 'reviewing', 'resolved', 'dismissed'];

const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: true,
      enum: [
        'spam',
        'harassment',
        'inappropriate_content',
        'fake_account',
        'hate_speech',
        'violence',
        'other'
      ]
    },
    description: {
      type: String,
      default: ''
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: 'pending'
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewNotes: {
      type: String,
      default: ''
    },
    // ⚠️ Avant: default: null (provoquait l'erreur de validation enum)
    resolution: {
      type: String,
      enum: RESOLUTION_ENUM,
      default: 'no_action', // valeur sûre et valide
      required: true
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    created_by: {
      type: String,
      default: 'SYSTEM'
    },
    modified_by: String
  },
  {
    timestamps: { createdAt: 'created_date', updatedAt: 'modified_date' },
    versionKey: false
  }
);

// Index pour performance
reportSchema.index({ reporter: 1, reportedUser: 1 });
reportSchema.index({ status: 1, created_date: -1 });
reportSchema.index({ reportedUser: 1, status: 1 });

// Normalisation de la cohérence status/resolution/resolvedAt
reportSchema.pre('save', function(next) {
  // Si en attente ou en cours de revue, on remet à zéro resolvedAt
  if (this.status === 'pending' || this.status === 'reviewing') {
    this.resolvedAt = null;
    // pour ces états, si resolution est absente/incorrecte, on force une valeur neutre
    if (!RESOLUTION_ENUM.includes(this.resolution)) {
      this.resolution = 'no_action';
    }
  }

  // Si résolu/dismissed et qu'aucune resolution fournie, on met 'no_action'
  if ((this.status === 'resolved' || this.status === 'dismissed') &&
      !RESOLUTION_ENUM.includes(this.resolution)) {
    this.resolution = 'no_action';
  }

  next();
});

// Méthode pour obtenir les statistiques des signalements
reportSchema.statics.getReportStats = async function(userId) {
  return this.aggregate([
    { $match: { reportedUser: userId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
};

module.exports = model('Report', reportSchema);
