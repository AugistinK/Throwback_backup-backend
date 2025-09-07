const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const { isAdmin, isSuperAdmin } = require('../../middlewares/authMiddleware');

// Middleware pour protéger toutes les routes admin
router.use(isAdmin);

// Tableau de bord
router.get('/dashboard', adminController.dashboard);

// Routes de gestion des utilisateurs
router.get('/users', adminController.usersList);
router.get('/users/create', adminController.showCreateUserForm);
router.post('/users/create', adminController.createUser);
router.get('/users/:id', adminController.userDetails);
router.get('/users/:id/edit', adminController.showEditUserForm);
router.post('/users/:id/edit', adminController.updateUser);

// Routes AJAX pour la gestion des utilisateurs
router.post('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/reset-login-attempts', adminController.resetLoginAttempts);

// Route de suppression d'utilisateur (protégée par isSuperAdmin)
router.delete('/users/:id', isSuperAdmin, adminController.deleteUser);

module.exports = router; 