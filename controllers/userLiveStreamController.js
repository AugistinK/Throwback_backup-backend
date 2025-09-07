// controllers/userLiveStreamController.js
const LiveStream = require('../models/LiveStream');
const LogAction  = require('../models/LogAction');
const mongoose   = require('mongoose');

const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'error';
const logger = {
  debug: (...a) => LOG_LEVEL === 'debug' && console.log(...a),
  info:  (...a) => ['debug','info'].includes(LOG_LEVEL) && console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

const GRACE_SECONDS = parseInt(process.env.LIVETHROWBACK_END_GRACE_SECONDS || '120', 10);
const FORCE_END_AFTER_MIN = parseInt(process.env.LIVETHROWBACK_FORCE_END_AFTER_MIN || '60', 10);

/** Met à jour automatiquement les statuts (start/stop) de manière non agressive */
const updateStreamStatuses = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - GRACE_SECONDS * 1000);
  let started = 0;
  let ended   = 0;

  try {
    // Démarrer les SCHEDULED arrivés à échéance
    const startRes = await LiveStream.updateMany(
      {
        status: 'SCHEDULED',
        scheduledStartTime: { $lte: now },
        scheduledEndTime: { $gt: now }
      },
      {
        $set: { status: 'LIVE', actualStartTime: now }
      }
    );
    started = startRes.modifiedCount || 0;
    if (started > 0) logger.info(`Auto-started ${started} scheduled streams`);

    // Terminer les LIVE dépassés de la "grace", sauf si loop=true,
    // à moins d’avoir largement dépassé l’heure de fin.
    const candidates = await LiveStream.find({
      status: 'LIVE',
      scheduledEndTime: { $lte: cutoff }
    });

    for (const stream of candidates) {
      const loopEnabled = stream?.playbackConfig?.loop === true;
      const overshootMs = now - new Date(stream.scheduledEndTime);
      const mustForceEnd = overshootMs >= FORCE_END_AFTER_MIN * 60 * 1000;

      if (loopEnabled && !mustForceEnd) {
        logger.debug(`Keeping LIVE (loop=true) "${stream.title}" (${stream._id})`);
        continue;
      }

      stream.status = 'COMPLETED';
      stream.actualEndTime = now;
      await stream.save();
      ended++;
    }

    if (ended > 0) logger.info(`Auto-ended ${ended} streams`);

    return { started, ended };
  } catch (err) {
    logger.error('Error updating stream statuses:', err);
    return { started, ended };
  }
};

/** Prog. compilations – gardée (ne change pas le src côté front) */
const updateCompilationProgress = async (streamId) => {
  try {
    const stream = await LiveStream.findById(streamId);
    if (!stream || stream.compilationType !== 'VIDEO_COLLECTION') return null;

    const videos = stream.compilationVideos || [];
    if (videos.length === 0) return null;

    // On ne pousse plus d'updates fréquents côté front : l’index serveur
    // reste informatif mais n’entraîne pas de changement de src côté client.
    const startTime = stream.actualStartTime || stream.scheduledStartTime;
    const elapsedMinutes = Math.floor((Date.now() - new Date(startTime)) / 60000);

    stream.currentVideoIndex =
      videos.length === 1 ? 0 : (Math.floor(elapsedMinutes / 4) % videos.length);

    await stream.save();
    logger.debug(`Updated compilation index ${stream.currentVideoIndex} for ${streamId}`);
    return stream;
  } catch (err) {
    logger.error('Error updating compilation progress:', err);
    return null;
  }
};

exports.getActiveLiveStreams = async (req, res) => {
  try {
    await updateStreamStatuses();
    const now = new Date();

    const baseFilter = {
      status: 'LIVE',
      scheduledEndTime: { $gt: now },
      $or: [{ actualStartTime: { $lte: now } }, { scheduledStartTime: { $lte: now } }]
    };

    let filter = { ...baseFilter };
    if (req.user) {
      filter = {
        ...baseFilter,
        $and: [
          baseFilter,
          { $or: [{ isPublic: true }, { author: req.user.id }] }
        ]
      };
    } else {
      filter.isPublic = true;
    }

    const livestreams = await LiveStream.find(filter)
      .populate('author', 'nom prenom photo_profil')
      .sort('-actualStartTime -scheduledStartTime');

    for (const s of livestreams) {
      if (s.compilationType === 'VIDEO_COLLECTION') {
        await updateCompilationProgress(s._id);
      }
    }

    // pas de slicing côté back => toutes les vidéos de la compilation restent dans payload
    res.status(200).json({
      success: true,
      count: livestreams.length,
      data: livestreams
    });
  } catch (error) {
    logger.error('Error fetching livestreams for users:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des livestreams' });
  }
};

exports.getLiveStreamById = async (req, res) => {
  try {
    await updateStreamStatuses();
    const streamId = req.params.id;

    const livestream = await LiveStream.findById(streamId)
      .populate('author', 'nom prenom photo_profil');

    if (!livestream) {
      return res.status(404).json({ success: false, message: 'Livestream non trouvé' });
    }

    // Public/owner check
    if (!livestream.isPublic && (!req.user || req.user.id !== livestream.author._id.toString())) {
      return res.status(403).json({ success: false, message: 'Ce livestream n’est pas public' });
    }

    // Mise à jour de l’index serveur (n’affecte plus le src côté client)
    if (livestream.compilationType === 'VIDEO_COLLECTION') {
      await updateCompilationProgress(streamId);
    }

    // Statistiques de vue
    if (req.user) {
      try {
        await LogAction.create({
          type_action: 'VIEW_LIVESTREAM',
          description_action: `User viewed "${livestream.title}"`,
          id_user: req.user.id,
          created_by: req.user.id
        });
        await LiveStream.findByIdAndUpdate(streamId, { $inc: { 'statistics.totalUniqueViewers': 1 } });
      } catch (e) { logger.error(e); }
    }

    res.status(200).json({ success: true, data: livestream });
  } catch (error) {
    logger.error('Error fetching livestream by ID:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération du livestream' });
  }
};

exports.likeLiveStream = async (req, res) => {
  try {
    const streamId = req.params.id;
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) return res.status(404).json({ success: false, message: 'Livestream non trouvé' });

    const now = new Date();
    if (livestream.status !== 'LIVE' || (livestream.scheduledEndTime && livestream.scheduledEndTime <= now)) {
      return res.status(400).json({ success: false, message: 'Ce livestream n’est plus actif' });
    }

    await LiveStream.findByIdAndUpdate(streamId, { $inc: { 'statistics.likes': 1 } });
    res.status(200).json({ success: true, message: 'Like ajouté' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du like' });
  }
};

exports.commentLiveStream = async (req, res) => {
  try {
    const liveChatController = require('./liveChatController');
    return liveChatController.addMessage(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de l’ajout du commentaire' });
  }
};

exports.getLiveStreamComments = async (req, res) => {
  try {
    const liveChatController = require('./liveChatController');
    return liveChatController.getMessages(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des commentaires' });
  }
};

const autoUpdateStreams = async (req, res, next) => {
  try { await updateStreamStatuses(); } catch (e) { logger.error(e); }
  next();
};

const cleanupStreamStatuses = async () => {
  try {
    const result = await updateStreamStatuses();
    logger.info(`Cleanup completed: started=${result.started}, ended=${result.ended}`);
    return result;
  } catch (e) {
    logger.error('Cleanup error:', e);
    return { started: 0, ended: 0, error: e.message };
  }
};

module.exports = {
  getActiveLiveStreams: exports.getActiveLiveStreams,
  getLiveStreamById:    exports.getLiveStreamById,
  likeLiveStream:       exports.likeLiveStream,
  commentLiveStream:    exports.commentLiveStream,
  getLiveStreamComments:exports.getLiveStreamComments,
  updateStreamStatuses,
  updateCompilationProgress,
  autoUpdateStreams,
  cleanupStreamStatuses
};
