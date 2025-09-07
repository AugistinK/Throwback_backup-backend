// services/streamScheduler.js
const cron = require('node-cron');
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');

const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
const logger = {
  debug: (...a) => LOG_LEVEL === 'debug' && console.log('[SCHED]', ...a),
  info:  (...a) => console.log('[SCHED]', ...a),
  warn:  (...a) => console.warn('[SCHED]', ...a),
  error: (...a) => console.error('[SCHED]', ...a),
};

// Délai de grâce pour ne pas couper un live pile au moment du scheduledEndTime
const GRACE_SECONDS = parseInt(process.env.LIVETHROWBACK_END_GRACE_SECONDS || '120', 10);
// Sécurité : même si loop=true, forcer l’arrêt passé ce seuil (minutes) après l’heure de fin
const FORCE_END_AFTER_MIN = parseInt(process.env.LIVETHROWBACK_FORCE_END_AFTER_MIN || '60', 10);

/**
 * Service de planification : on NE démarre rien ici (la logique de démarrage auto
 * vit côté contrôleurs/cleanup), on gère seulement la fin des streams live
 * avec une politique plus tolérante.
 */
const initStreamScheduler = () => {
  logger.info('Initializing stream scheduler');

  const task = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - GRACE_SECONDS * 1000);

      // On ne termine pas un stream si loop=true (compilations en boucle),
      // sauf si on dépasse très largement l’heure de fin (FORCE_END_AFTER_MIN).
      const streamsToEnd = await LiveStream.find({
        status: 'LIVE',
        scheduledEndTime: { $lte: cutoff }
      });

      let endedCount = 0;

      for (const stream of streamsToEnd) {
        const loopEnabled = stream?.playbackConfig?.loop === true;
        const overshootMs = now - new Date(stream.scheduledEndTime);
        const mustForceEnd = overshootMs >= FORCE_END_AFTER_MIN * 60 * 1000;

        if (loopEnabled && !mustForceEnd) {
          // on laisse tourner, c’est volontaire
          logger.debug(`Skipping end for looping stream "${stream.title}" (${stream._id})`);
          continue;
        }

        try {
          stream.status = 'COMPLETED';
          stream.actualEndTime = now;

          if (stream.recordAfterStream) {
            stream.recordedVideoId = `rec_${Date.now()}_${stream._id}`;
          }
          await stream.save();

          await LogAction.create({
            type_action: 'AUTO_END_LIVESTREAM',
            description_action: `Fin automatique du livestream "${stream.title}"`,
            id_user: stream.author,
            created_by: 'SYSTEM'
          });

          endedCount++;
          logger.info(`Auto-completed livestream: ${stream.title} (${stream._id})`);
        } catch (err) {
          logger.error(`Error ending livestream ${stream._id}:`, err);
        }
      }

      logger.debug(
        endedCount > 0
          ? `Scheduler ended ${endedCount} live(s)`
          : 'Scheduler: nothing to end this minute'
      );
    } catch (error) {
      logger.error('Error in stream scheduler:', error);
    }
  });

  return { task };
};

module.exports = { initStreamScheduler };
