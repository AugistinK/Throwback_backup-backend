// routes/api/video-info.js
const express = require('express');
const router = express.Router();
const videoInfoController = require('../../controllers/videoInfoController');
const { protect } = require('../../middlewares/authMiddleware');

/**
 * @route   GET /api/video-info
 * @desc    Récupérer les informations d'une vidéo à partir de son URL
 * @access  Private
 */
router.get('/', protect, videoInfoController.getVideoInfo);

module.exports = router;