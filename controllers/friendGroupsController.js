// controllers/friendGroupsController.js 
const FriendGroup = require('../models/FriendGroup');
const Friendship = require('../models/Friendship');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer tous les groupes d'amis de l'utilisateur
 * @route   GET /api/friends/groups
 * @access  Private
 */
exports.getFriendGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const groups = await FriendGroup.find({ owner: userId })
      .populate('members', 'nom prenom email photo_profil')
      .sort({ created_date: -1 });
    
    res.status(200).json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Error in getFriendGroups:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des groupes'
    });
  }
};

/**
 * @desc    Créer un nouveau groupe d'amis
 * @route   POST /api/friends/groups
 * @access  Private
 */
exports.createFriendGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, members, color, description } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }
    
    if (!members || members.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'At least 1 participant is required'
      });
    }
    
    // Vérifier que tous les participants sont amis avec le créateur
    const friendships = await Promise.all(
      members.map(p => Friendship.areFriends(userId, p))
    );
    
    if (friendships.some(f => !f)) {
      return res.status(403).json({
        success: false,
        message: 'You can only add friends to groups'
      });
    }
    
    // ✅ CORRECTION: Inclure le créateur dans les membres
    const allMembers = [...new Set([userId, ...members])];
    
    const group = await FriendGroup.create({
      name: name.trim(),
      owner: userId,
      members: allMembers,
      color: color || '#b31217',
      description: description || '',
      created_by: userId
    });
    
    await group.populate('members', 'nom prenom email photo_profil');
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_GROUP_CREATED',
      description_action: `Created friend group: ${group.name}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    // ✅ CORRECTION: Notifier tous les membres (sauf le créateur)
    const io = req.app.get('io');
    if (io) {
      members.forEach(memberId => {
        io.to(memberId).emit('group-invitation', {
          groupId: group._id,
          groupName: group.name,
          creatorId: userId,
          creatorName: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Unknown',
          timestamp: Date.now()
        });
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Friend group created successfully. Members have been notified.',
      data: group
    });
  } catch (error) {
    console.error('Error in createFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du groupe'
    });
  }
};

/**
 * @desc    Mettre à jour un groupe d'amis
 * @route   PUT /api/friends/groups/:groupId
 * @access  Private
 */
exports.updateFriendGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { name, members, color, description } = req.body;
    
    const group = await FriendGroup.findOne({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not the owner'
      });
    }
    
    if (name) group.name = name.trim();
    
    // ✅ CORRECTION: Toujours inclure le créateur dans les membres
    if (members !== undefined) {
      const allMembers = [...new Set([userId, ...members])];
      group.members = allMembers;
    }
    
    if (color) group.color = color;
    if (description !== undefined) group.description = description;
    
    group.modified_date = Date.now();
    group.modified_by = userId;
    
    await group.save();
    await group.populate('members', 'nom prenom email photo_profil');
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_GROUP_UPDATED',
      description_action: `Updated friend group: ${group.name}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    // Notifier les nouveaux membres
    const io = req.app.get('io');
    if (io && members) {
      members.forEach(memberId => {
        if (memberId !== userId) {
          io.to(memberId).emit('group-updated', {
            groupId: group._id,
            groupName: group.name,
            timestamp: Date.now()
          });
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Friend group updated successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in updateFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du groupe'
    });
  }
};

/**
 * @desc    Supprimer un groupe d'amis
 * @route   DELETE /api/friends/groups/:groupId
 * @access  Private
 */
exports.deleteFriendGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    
    const group = await FriendGroup.findOneAndDelete({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not the owner'
      });
    }
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_GROUP_DELETED',
      description_action: `Deleted friend group: ${group.name}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    res.status(200).json({
      success: true,
      message: 'Friend group deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du groupe'
    });
  }
};

/**
 * @desc    Ajouter des membres à un groupe
 * @route   POST /api/friends/groups/:groupId/members
 * @access  Private
 */
exports.addMembersToGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { memberIds } = req.body;
    
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs array is required'
      });
    }
    
    const group = await FriendGroup.findOne({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not the owner'
      });
    }
    
    await group.addMembers(memberIds);
    await group.populate('members', 'nom prenom email photo_profil');
    
    // Notifier les nouveaux membres
    const io = req.app.get('io');
    if (io) {
      memberIds.forEach(memberId => {
        io.to(memberId).emit('group-invitation', {
          groupId: group._id,
          groupName: group.name,
          creatorId: userId,
          creatorName: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Unknown',
          timestamp: Date.now()
        });
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Members added successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in addMembersToGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout des membres'
    });
  }
};

/**
 * @desc    Retirer des membres d'un groupe
 * @route   DELETE /api/friends/groups/:groupId/members
 * @access  Private
 */
exports.removeMembersFromGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { groupId } = req.params;
    const { memberIds } = req.body;
    
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs array is required'
      });
    }
    
    const group = await FriendGroup.findOne({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not the owner'
      });
    }
    
    // Ne pas permettre de retirer le créateur
    if (memberIds.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the group owner'
      });
    }
    
    await group.removeMembers(memberIds);
    await group.populate('members', 'nom prenom email photo_profil');
    
    res.status(200).json({
      success: true,
      message: 'Members removed successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in removeMembersFromGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du retrait des membres'
    });
  }
};

module.exports = exports;