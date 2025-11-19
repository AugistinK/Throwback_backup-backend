// backend/routes/supportRoutes.js
const express = require('express');
const router = express.Router();
const { contactSupport } = require('../controllers/supportController');
const { protect } = require('../middlewares/authMiddleware'); 

// POST /api/support/contact
router.post('/contact', protect, contactSupport);

module.exports = router;
