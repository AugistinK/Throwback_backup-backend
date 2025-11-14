// controllers/notificationController.js
const {
  getUserNotifications,
  markAllAsRead,
  markNotificationAsRead,
} = require('../services/notificationService');

/**
 * GET /api/notifications
 * Récupère les notifications de l'utilisateur connecté
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé',
      });
    }

    const limit = parseInt(req.query.limit, 10) || 30;
    const skip = parseInt(req.query.skip, 10) || 0;

    const { data, unreadCount } = await getUserNotifications(userId, {
      limit,
      skip,
    });

    return res.json({
      success: true,
      data,
      unreadCount,
    });
  } catch (error) {
    console.error('Erreur getNotifications :', error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des notifications",
    });
  }
};

/**
 * POST /api/notifications/mark-all-read
 * Marque toutes les notifications de l'utilisateur comme lues
 */
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé',
      });
    }

    await markAllAsRead(userId);

    return res.json({
      success: true,
      message: 'Toutes les notifications ont été marquées comme lues',
    });
  } catch (error) {
    console.error('Erreur markAllRead :', error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors du marquage des notifications",
    });
  }
};

/**
 * POST /api/notifications/:id/read
 * Marque une notification spécifique comme lue
 */
exports.markOneRead = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé',
      });
    }

    const { id } = req.params;

    const notif = await markNotificationAsRead(userId, id);

    if (!notif) {
      return res.status(404).json({
        success: false,
        message: 'Notification introuvable',
      });
    }

    return res.json({
      success: true,
      data: {
        id: notif._id.toString(),
        type: notif.type,
        title: notif.title,
        message: notif.message,
        link: notif.link,
        read: notif.read,
        createdAt: notif.createdAt,
        actor: notif.actor,
        metadata: notif.metadata || {},
      },
    });
  } catch (error) {
    console.error('Erreur markOneRead :', error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors du marquage de la notification",
    });
  }
};
