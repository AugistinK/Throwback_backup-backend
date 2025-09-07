const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const adminRoutes = require('./admin');

// Routes d'authentification
router.use('/auth', authRoutes);

// Routes d'administration
router.use('/admin', adminRoutes);

module.exports = router; 