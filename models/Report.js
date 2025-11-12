// models/Report.js 
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

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
      enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
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
    resolution: {
      type: String,
      enum: ['no_action', 'warning', 'temporary_ban', 'permanent_ban', 'deleted_content'],
      default: null
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

// Méthode pour obtenir les statistiques des signalements
reportSchema.statics.getReportStats = async function(userId) {
  return this.aggregate([
    {
      $match: { reportedUser: userId }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = model('Report', reportSchema);