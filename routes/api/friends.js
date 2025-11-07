// routes/api/friends.js 
const express = require('express');
const router = express.Router();
const friendsController = require('../../controllers/friendsController');
const friendGroupsController = require('../../controllers/friendGroupsController');
const { protect } = require('../../middlewares/authMiddleware');

// ============================================
// ROUTES DES AMIS
// ============================================

/**
 * @route   GET /api/friends
 * @desc    Récupérer tous les amis de l'utilisateur
 * @access  Private
 */
router.get('/', protect, friendsController.getFriends);

/**
 * @route   GET /api/friends/requests
 * @desc    Récupérer les demandes d'amis en attente
 * @access  Private
 */
router.get('/requests', protect, friendsController.getFriendRequests);

/**
 * @route   GET /api/friends/suggestions
 * @desc    Récupérer les suggestions d'amis
 * @access  Private
 */
router.get('/suggestions', protect, friendsController.getFriendSuggestions);

/**
 * @route   GET /api/friends/stats
 * @desc    Récupérer les statistiques d'amitié
 * @access  Private
 */
router.get('/stats', protect, friendsController.getFriendshipStats);

/**
 * @route   GET /api/friends/mutual/:userId
 * @desc    Récupérer les amis mutuels avec un utilisateur
 * @access  Private
 */
router.get('/mutual/:userId', protect, friendsController.getMutualFriends);

/**
 * @route   GET /api/friends/blocked
 * @desc    Récupérer les utilisateurs bloqués
 * @access  Private
 */
router.get('/blocked', protect, friendsController.getBlockedUsers);

/**
 * @route   POST /api/friends/request
 * @desc    Envoyer une demande d'ami
 * @access  Private
 */
router.post('/request', protect, friendsController.sendFriendRequest);

/**
 *  ROUTE CRITIQUE: Accepter une demande d'ami
 * @route   PUT /api/friends/accept/:friendshipId
 * @desc    Accepter une demande d'ami
 * @access  Private
 */
router.put('/accept/:friendshipId', protect, friendsController.acceptFriendRequest);

/**
 * @route   DELETE /api/friends/reject/:friendshipId
 * @desc    Refuser une demande d'ami
 * @access  Private
 */
router.delete('/reject/:friendshipId', protect, friendsController.rejectFriendRequest);

/**
 * @route   DELETE /api/friends/remove/:friendId
 * @desc    Retirer un ami
 * @access  Private
 */
router.delete('/remove/:friendId', protect, friendsController.removeFriend);

/**
 * @route   POST /api/friends/block
 * @desc    Bloquer un utilisateur
 * @access  Private
 */
router.post('/block', protect, friendsController.blockUser);

/**
 * @route   DELETE /api/friends/unblock/:userId
 * @desc    Débloquer un utilisateur
 * @access  Private
 */
router.delete('/unblock/:userId', protect, friendsController.unblockUser);

// ============================================
// ROUTES DES GROUPES D'AMIS
// ============================================

/**
 * @route   GET /api/friends/groups
 * @desc    Récupérer tous les groupes d'amis
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