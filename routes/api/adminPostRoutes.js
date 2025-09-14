// routes/api/adminPostRoutes.js
const express = require('express');
const router = express.Router();
const adminPostController = require('../../controllers/adminPostController');
const { protect, isAdmin } = require('../../middlewares/authMiddleware');

// Appliquer les middlewares d'authentification et d'autorisation à toutes les routes
router.use(protect);
router.use(isAdmin);

// Routes pour la gestion des posts

router.get('/stats', adminPostController.getModerationStats);
router.put('/:id/moderate', adminPostController.moderatePost);
router.put('/:id/restore', adminPostController.restorePost);



module.exports = router;