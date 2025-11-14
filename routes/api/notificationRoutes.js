// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const notificationController = require('../../controllers/notificationController');

// Toutes les routes notifications nécessitent d'être connecté
router.use(protect);
// ou : router.use(requireAuth);

/**
 * GET /api/notifications
 * Récupérer les notifications de l'utilisateur
 */
router.get('/', notificationController.getNotifications);

/**
 * POST /api/notifications/mark-all-read
 * Marquer toutes les notifications comme lues
 */
router.post('/mark-all-read', notificationController.markAllRead);

/**
 * POST /api/notifications/:id/read
 * Marquer une notification spécifique comme lue
 */
router.post('/:id/read', notificationController.markOneRead);

module.exports = router;
