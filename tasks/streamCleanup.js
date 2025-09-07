// tasks/streamCleanup.js
const cron = require('node-cron');
const {
  cleanupStreamStatuses, // centralise start/end avec la logique "grace"
} = require('../controllers/userLiveStreamController');

const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
const logger = {
  debug: (...a) => LOG_LEVEL === 'debug' && console.log(`[CRON-DEBUG ${new Date().toISOString()}]`, ...a),
  info:  (...a) => console.log(`[CRON-INFO ${new Date().toISOString()}]`, ...a),
  warn:  (...a) => console.warn(`[CRON-WARN ${new Date().toISOString()}]`, ...a),
  error: (...a) => console.error(`[CRON-ERROR ${new Date().toISOString()}]`, ...a)
};

const CLEANUP_INTERVAL = '* * * * *';
const STATS_INTERVAL   = '0 */6 * * *';

let sessionStats = {
  totalStarted: 0,
  totalEnded: 0,
  lastCleanup: null,
  errors: 0,
  uptime: Date.now()
};

const runStreamCleanup = async () => {
  try {
    logger.debug('Starting stream status cleanup...');
    const t0 = Date.now();

    // 🔁 On utilise notre contrôleur unifié (avec grace period + loop)
    const result = await cleanupStreamStatuses();
    const duration = Date.now() - t0;

    sessionStats.totalStarted += result.started || 0;
    sessionStats.totalEnded   += result.ended || 0;
    sessionStats.lastCleanup   = new Date();

    if ((result.started || 0) + (result.ended || 0) > 0) {
      logger.info(`Cleanup in ${duration}ms: started=${result.started || 0}, ended=${result.ended || 0}`);
    } else {
      logger.debug(`✓ Cleanup in ${duration}ms: no changes`);
    }

    return { ...result, duration };
  } catch (error) {
    sessionStats.errors++;
    logger.error('Error in stream cleanup:', error.message);
    return { started: 0, ended: 0, duration: 0, error: error.message };
  }
};

const logSessionStats = () => {
  const uptimeMin = Math.floor((Date.now() - sessionStats.uptime) / 1000 / 60);
  logger.info('Stream Cleanup Statistics:');
  logger.info(`  Uptime: ${uptimeMin} min`);
  logger.info(`  Total started: ${sessionStats.totalStarted}`);
  logger.info(`  Total ended: ${sessionStats.totalEnded}`);
  logger.info(`  Errors: ${sessionStats.errors}`);
  logger.info(`  Last cleanup: ${sessionStats.lastCleanup ? sessionStats.lastCleanup.toLocaleString() : 'Never'}`);
};

const runMaintenanceTasks = async () => {
  // tu peux garder ta maintenance existante ici si besoin
  logger.info('Running maintenance tasks (noop placeholder)');
};

const gracefulShutdown = () => {
  logger.info('Graceful shutdown for stream cleanup tasks');
  logSessionStats();
  cron.getTasks().forEach((task, name) => {
    task.stop();
    logger.info(`  Stopped cron task: ${name}`);
  });
  process.exit(0);
};

const initializeStreamCleanup = () => {
  logger.info('Initializing stream cleanup tasks...');

  const cleanupTask = cron.schedule(CLEANUP_INTERVAL, runStreamCleanup, {
    name: 'stream-status-cleanup',
    timezone: process.env.TZ || 'Europe/Paris'
  });

  const statsTask = cron.schedule(STATS_INTERVAL, logSessionStats, {
    name: 'stream-statistics',
    timezone: process.env.TZ || 'Europe/Paris'
  });

  const maintenanceTask = cron.schedule('0 3 * * *', runMaintenanceTasks, {
    name: 'stream-maintenance',
    timezone: process.env.TZ || 'Europe/Paris'
  });

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  logger.info('Stream cleanup tasks initialized successfully');
  setTimeout(runStreamCleanup, 5000);

  return {
    cleanupTask,
    statsTask,
    maintenanceTask,
    getStats: () => ({ ...sessionStats }),
    runManualCleanup: runStreamCleanup
  };
};

const healthCheck = () => {
  const tasks = cron.getTasks();
  const health = {
    status: 'healthy',
    activeTasks: tasks.size,
    lastCleanup: sessionStats.lastCleanup,
    uptime: Math.floor((Date.now() - sessionStats.uptime) / 1000),
    stats: sessionStats
  };
  if (!sessionStats.lastCleanup) {
    health.status = 'warning';
    health.warning = 'No cleanup has been performed yet';
  }
  return health;
};

module.exports = {
  initializeStreamCleanup,
  runStreamCleanup,
  logSessionStats,
  runMaintenanceTasks,
  healthCheck,
  getStats: () => ({ ...sessionStats })
};

if (require.main === module) {
  logger.info('Starting ThrowBack Stream Cleanup Service...');
  initializeStreamCleanup();
}
