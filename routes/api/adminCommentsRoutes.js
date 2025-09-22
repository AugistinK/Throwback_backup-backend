// routes/api/adminCommentsRoutes.js
const express = require('express');
const router = express.Router();

const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/roleMiddleware');
const adminCommentsController = require('../../controllers/adminCommentsController');

// Protéger toutes les routes admin
router.use(protect);
router.use(authorize(['admin', 'superadmin']));

// Liste + filtres
router.get('/', adminCommentsController.getAllComments);

// Stats
router.get('/stats', adminCommentsController.getCommentsStats);

// Modération en lot
router.put('/bulk-moderate', adminCommentsController.bulkModerateComments);

// Détail, modération unitaire et réponse
router.get('/:id', adminCommentsController.getCommentDetails);
router.put('/:id/moderate', adminCommentsController.moderateComment);
router.post('/:id/reply', adminCommentsController.replyToComment);

module.exports = router;
