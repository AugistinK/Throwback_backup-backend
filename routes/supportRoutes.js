// backend/routes/supportRoutes.js
const express = require('express');
const router = express.Router();
const { contactSupport } = require('../controllers/supportController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/contact', protect, contactSupport);

module.exports = router;
