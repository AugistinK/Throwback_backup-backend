// services/notificationService.js
const Notification = require('../models/Notification');

/**
 * Création générique d'une notification
 * @param {Object} payload
 * @param {String} payload.userId - ID de l'utilisateur cible
 * @param {String} payload.type - type de la notif (friend_request, like, message, ...)
 * @param {String} payload.title - titre court
 * @param {String} payload.message - message détaillé
 * @param {String} [payload.link] - lien front à ouvrir au clic
 * @param {String} [payload.actorId] - user qui déclenche l'action
 * @param {Object} [payload.metadata] - données supplémentaires
 */
async function createNotification({
  userId,
  type,
  title,
  message,
  link = null,
  actorId = null,
  metadata = {},
}) {
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    message,
    link,
    actor: actorId,
    metadata,
  });

  return notification;
}

/**
 * Récupère les notifications d'un user
 */
async function getUserNotifications(userId, { limit = 30, skip = 0 } = {}) {
  const [items, totalUnread] = await Promise.all([
    Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ user: userId, read: false }),
  ]);

  const data = items.map((n) => ({
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt,
    actor: n.actor,
    metadata: n.metadata || {},
  }));

  return { data, unreadCount: totalUnread };
}

/**
 * Marque toutes les notifications comme lues
 */
async function markAllAsRead(userId) {
  await Notification.updateMany(
    { user: userId, read: false },
    { $set: { read: true } }
  );
}

/**
 * Marque une notification comme lue
 */
async function markNotificationAsRead(userId, notificationId) {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { read: true } },
    { new: true }
  );

  return notif;
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAllAsRead,
  markNotificationAsRead,
};
