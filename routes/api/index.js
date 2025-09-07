// routes/api/index.js
const express = require('express');
const router = express.Router();

// Importer les routes
// const authRoutes = require('./auth');
// const userRoutes = require('./user');
const videosRoutes = require('./videos');
// Importer d'autres routes selon les besoins

// Configurer les routes
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
router.use('/videos', videosRoutes);
// Configurer d'autres routes

module.exports = router;