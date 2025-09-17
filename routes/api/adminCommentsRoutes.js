// routes/api/adminCommentsRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/roleMiddleware');
const adminCommentsController = require('../../controllers/adminCommentsController');

// Middleware pour protéger toutes les routes admin
router.use(protect);
router.use(authorize(['admin', 'superadmin']));

router.get('/', adminCommentsController.getAllComments);
router.get('/stats', adminCommentsController.getCommentsStats);
router.put('/bulk-moderate', adminCommentsController.bulkModerateComments);
router.get('/:id', adminCommentsController.getCommentDetails);
router.put('/:id/moderate', adminCommentsController.moderateComment);
router.post('/:id/reply', adminCommentsController.replyToComment);

module.exports = router;
