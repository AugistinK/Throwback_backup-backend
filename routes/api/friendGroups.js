// routes/api/friendGroups.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const friendGroupsController = require('../../controllers/friendGroupsController');

/**
 * @route   GET /api/friends/groups
 * @desc    Récupérer tous les groupes d'amis de l'utilisateur
 * @access  Private
 */
router.get('/groups', protect, friendGroupsController.getFriendGroups);

/**
 * @route   POST /api/friends/groups
 * @desc    Créer un nouveau groupe d'amis
 * @access  Private
 */
router.post('/groups', protect, friendGroupsController.createFriendGroup);

/**
 * @route   PUT /api/friends/groups/:groupId
 * @desc    Mettre à jour un groupe d'amis
 * @access  Private
 */
router.put('/groups/:groupId', protect, friendGroupsController.updateFriendGroup);

/**
 * @route   DELETE /api/friends/groups/:groupId
 * @desc    Supprimer un groupe d'amis
 * @access  Private
 */
router.delete('/groups/:groupId', protect, friendGroupsController.deleteFriendGroup);

/**
 * @route   POST /api/friends/groups/:groupId/members
 * @desc    Ajouter des membres à un groupe
 * @access  Private
 */
router.post('/groups/:groupId/members', protect, friendGroupsController.addMembersToGroup);

/**
 * @route   DELETE /api/friends/groups/:groupId/members
 * @desc    Retirer des membres d'un groupe
 * @access  Private
 */
router.delete('/groups/:groupId/members', protect, friendGroupsController.removeMembersFromGroup);

module.exports = router;