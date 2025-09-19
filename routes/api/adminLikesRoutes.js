// routes/api/adminLikesRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/roleMiddleware');
const adminLikesController = require('../../controllers/adminLikesController');

router.use(protect);
router.use(authorize(['admin', 'superadmin']));

router.get('/', adminLikesController.getAllLikes);
router.get('/stats', adminLikesController.getLikesStats);
router.get('/:id', adminLikesController.getLikeDetails);
router.delete('/:id', adminLikesController.deleteLike);
router.delete('/bulk', adminLikesController.bulkDeleteLikes);

module.exports = router;
