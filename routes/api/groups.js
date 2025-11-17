// routes/api/groups.js - ROUTES API POUR LES GROUPES
const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/authMiddleware');
const groupMessagesController = require('../../controllers/groupMessagesController');

/**
 * @route   POST /api/groups
 * @desc    Créer un nouveau groupe
 * @access  Private
 */
router.post(
  '/',
  protect,
  groupMessagesController.createGroup
);

/**
 * @route   GET /api/groups
 * @desc    Récupérer tous les groupes de l'utilisateur
 * @access  Private
 */
router.get(
  '/',
  protect,
  groupMessagesController.getUserGroups
);

/**
 * @route   GET /api/groups/:groupId
 * @desc    Récupérer les détails d'un groupe
 * @access  Private
 */
router.get(
  '/:groupId',
  protect,
  groupMessagesController.getGroupDetails
);

/**
 * @route   PUT /api/groups/:groupId
 * @desc    Mettre à jour les informations du groupe
 * @access  Private (Admin/Creator only)
 */
router.put(
  '/:groupId',
  protect,
  groupMessagesController.updateGroup
);

/**
 * @route   DELETE /api/groups/:groupId
 * @desc    Supprimer un groupe
 * @access  Private (Creator only)
 */
router.delete(
  '/:groupId',
  protect,
  groupMessagesController.deleteGroup
);

/**
 * @route   GET /api/groups/:groupId/messages
 * @desc    Récupérer les messages d'un groupe
 * @access  Private
 */
router.get(
  '/:groupId/messages',
  protect,
  groupMessagesController.getGroupMessages
);

/**
 * @route   POST /api/groups/:groupId/messages
 * @desc    Envoyer un message dans un groupe
 * @access  Private
 */
router.post(
  '/:groupId/messages',
  protect,
  groupMessagesController.sendGroupMessage
);

/**
 * @route   POST /api/groups/:groupId/members
 * @desc    Ajouter des membres au groupe
 * @access  Private (Admin/Creator only)
 */
router.post(
  '/:groupId/members',
  protect,
  groupMessagesController.addGroupMembers
);

/**
 * @route   DELETE /api/groups/:groupId/members/:memberId
 * @desc    Retirer un membre du groupe
 * @access  Private (Admin/Creator only)
 */
router.delete(
  '/:groupId/members/:memberId',
  protect,
  groupMessagesController.removeGroupMember
);

/**
 * @route   POST /api/groups/:groupId/leave
 * @desc    Quitter un groupe
 * @access  Private
 */
router.post(
  '/:groupId/leave',
  protect,
  groupMessagesController.leaveGroup
);

/**
 * @route   POST /api/groups/:groupId/admins/:memberId
 * @desc    Promouvoir un membre en admin
 * @access  Private (Creator only)
 */
router.post(
  '/:groupId/admins/:memberId',
  protect,
  groupMessagesController.promoteToAdmin
);

module.exports = router;