// controllers/friendsController.js
const Friendship = require('../models/Friendship');
const FriendGroup = require('../models/FriendGroup');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer tous les amis de l'utilisateur connecté
 * @route   GET /api/friends
 * @access  Private
 */
exports.getFriends = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const friends = await Friendship.getFriends(userId);
    
    res.status(200).json({
      success: true,
      data: friends
    });
  } catch (error) {
    console.error('Error in getFriends:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des amis'
    });
  }
};

/**
 * @desc    Récupérer les demandes d'amis en attente
 * @route   GET /api/friends/requests
 * @access  Private
 */
exports.getFriendRequests = async (req, res) => {
  try {
    console.log('NOUVELLE VERSION: Starting getFriendRequests function');
    const userId = req.user.id || req.user._id;
    
    // Version robuste qui évite populate() et l'utilisation de _doc
    const formattedRequests = [];
    
    try {
      // Récupérer les demandes d'amitié
      const requests = await Friendship.find({
        user2: userId,
        status: 'pending'
      }).sort({ created_date: -1 });
      
      console.log(`Found ${requests.length} friend requests`);
      
      // Récupérer tous les IDs des expéditeurs
      const senderIds = requests
        .map(r => r.user1 ? r.user1.toString() : null)
        .filter(id => id !== null);
      
      // Convertir les IDs en ObjectId pour la requête mongoose
      const objectIds = senderIds.map(id => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (err) {
          console.log(`Invalid ObjectId: ${id}`);
          return null;
        }
      }).filter(id => id !== null);
      
      // Récupérer tous les utilisateurs en une seule requête
      const senders = await User.find({
        _id: { $in: objectIds }
      })
      .select('_id nom prenom email photo_profil ville')
      .lean();
      
      console.log(`Found ${senders.length} users from database`);
      
      // Créer un map d'utilisateurs pour un accès rapide
      const senderMap = {};
      senders.forEach(sender => {
        senderMap[sender._id.toString()] = sender;
      });
      
      // Construire le résultat final
      for (const request of requests) {
        const senderId = request.user1 ? request.user1.toString() : null;
        const sender = senderMap[senderId];
        
        formattedRequests.push({
          friendshipId: request._id.toString(),
          _id: senderId,
          nom: sender?.nom || 'Utilisateur inconnu',
          prenom: sender?.prenom || '',
          email: sender?.email || '',
          photo_profil: sender?.photo_profil || null,
          ville: sender?.ville || null,
          requestDate: request.created_date
        });
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Fallback à l'API MongoDB native en cas d'erreur
      try {
        const db = mongoose.connection.db;
        const friendshipCollection = db.collection('friendships');
        const userCollection = db.collection('users');
        
        const rawRequests = await friendshipCollection.find({
          user2: userId.toString(),
          status: 'pending'
        }).sort({ created_date: -1 }).toArray();
        
        for (const request of rawRequests) {
          let sender = null;
          
          try {
            if (request.user1) {
              sender = await userCollection.findOne({ 
                _id: new mongoose.Types.ObjectId(request.user1.toString()) 
              });
            }
          } catch (innerError) {
            console.error('Error finding sender:', innerError);
          }
          
          formattedRequests.push({
            friendshipId: request._id.toString(),
            _id: request.user1 ? request.user1.toString() : null,
            nom: sender?.nom || 'Utilisateur inconnu',
            prenom: sender?.prenom || '',
            email: sender?.email || '',
            photo_profil: sender?.photo_profil || null,
            ville: sender?.ville || null,
            requestDate: request.created_date
          });
        }
      } catch (nativeError) {
        console.error('Native MongoDB error:', nativeError);
      }
    }
    
    console.log(`Returning ${formattedRequests.length} formatted requests`);
    
    return res.status(200).json({
      success: true,
      data: formattedRequests
    });
  } catch (error) {
    console.error('Error in getFriendRequests:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des demandes',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les suggestions d'amis
 * @route   GET /api/friends/suggestions
 * @access  Private
 */
exports.getFriendSuggestions = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const currentUser = await User.findById(userId);
    
    // Récupérer les IDs des amis existants et demandes en cours
    const existingFriendships = await Friendship.find({
      $or: [
        { user1: userId },
        { user2: userId }
      ]
    });
    
    const excludedIds = existingFriendships.map(f => 
      f.user1.toString() === userId.toString() ? f.user2 : f.user1
    );
    excludedIds.push(userId);
    
    // Suggestions basées sur la ville
    const suggestions = await User.find({
      _id: { $nin: excludedIds },
      ville: currentUser.ville,
      statut_compte: 'ACTIF'
    })
    .limit(30)
    .select('nom prenom email photo_profil ville')
    .lean();

    const formattedSuggestions = suggestions.map(user => ({
      ...user,         
      reason: 'Same city'
    }));
    
    res.status(200).json({
      success: true,
      data: formattedSuggestions
    });
  } catch (error) {
    console.error('Error in getFriendSuggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des suggestions'
    });
  }
};

/**
 * @desc    Envoyer une demande d'ami
 * @route   POST /api/friends/request
 * @access  Private
 */
exports.sendFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.body;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }
    
    if (userId.toString() === friendId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a friend request to yourself'
      });
    }
    
    // Vérifier si une relation existe déjà
    const existingFriendship = await Friendship.findOne({
      $or: [
        { user1: userId, user2: friendId },
        { user1: friendId, user2: userId }
      ]
    });
    
    if (existingFriendship) {
      return res.status(400).json({
        success: false,
        message: 'Friend request already exists or you are already friends'
      });
    }
    
    // Créer la demande
    const friendship = await Friendship.create({
      user1: userId,
      user2: friendId,
      initiator: userId,
      status: 'pending',
      created_by: userId
    });
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_REQUEST_SENT',
      description_action: `Friend request sent to user ${friendId}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      data: friendship
    });
  } catch (error) {
    console.error('Error in sendFriendRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de la demande'
    });
  }
};

/**
 * @desc    Accepter une demande d'ami
 * @route   PUT /api/friends/accept/:friendshipId
 * @access  Private
 */
exports.acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendshipId } = req.params;
    
    console.log(`Accepting friendship ${friendshipId} for user ${userId}`);
    
    if (!friendshipId) {
      return res.status(400).json({
        success: false,
        message: 'Friendship ID is required'
      });
    }

    // Convertir l'ID en ObjectId si nécessaire
    let friendshipObjectId;
    try {
      friendshipObjectId = mongoose.Types.ObjectId.isValid(friendshipId)
        ? new mongoose.Types.ObjectId(friendshipId)
        : friendshipId;
    } catch (error) {
      console.error('Error converting friendshipId to ObjectId:', error);
      friendshipObjectId = friendshipId;
    }
      
    const friendship = await Friendship.findOne({
      _id: friendshipObjectId,
      user2: userId,
      status: 'pending'
    });
    
    if (!friendship) {
      console.log(`Friendship not found: ${friendshipId} for user ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }
    
    friendship.status = 'accepted';
    friendship.modified_date = Date.now();
    friendship.modified_by = userId;
    await friendship.save();
    
    // Log action
    await LogAction.create({
      type_action: 'FRIEND_REQUEST_ACCEPTED',
      description_action: `Friend request accepted from user ${friendship.user1}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    res.status(200).json({
      success: true,
      message: 'Friend request accepted successfully',
      data: friendship
    });
  } catch (error) {
    console.error('Error in acceptFriendRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting friend request: ' + error.message
    });
  }
};

/**
 * @desc    Refuser une demande d'ami
 * @route   DELETE /api/friends/reject/:friendshipId
 * @access  Private
 */
exports.rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendshipId } = req.params;
    
    const friendship = await Friendship.findOneAndDelete({
      _id: friendshipId,
      user2: userId,
      status: 'pending'
    });
    
    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_REQUEST_REJECTED',
      description_action: `Friend request rejected from user ${friendship.user1}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    res.status(200).json({
      success: true,
      message: 'Friend request rejected'
    });
  } catch (error) {
    console.error('Error in rejectFriendRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du refus de la demande'
    });
  }
};

/**
 * @desc    Retirer un ami
 * @route   DELETE /api/friends/remove/:friendId
 * @access  Private
 */
exports.removeFriend = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.params;
    
    const friendship = await Friendship.findOneAndDelete({
      $or: [
        { user1: userId, user2: friendId },
        { user1: friendId, user2: userId }
      ],
      status: 'accepted'
    });
    
    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }
    
    // Log
    await LogAction.create({
      type_action: 'FRIEND_REMOVED',
      description_action: `Removed friend ${friendId}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    res.status(200).json({
      success: true,
      message: 'Friend removed successfully'
    });
  } catch (error) {
    console.error('Error in removeFriend:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'ami'
    });
  }
};

/**
 * @desc    Rechercher des utilisateurs
 * @route   GET /api/users/search
 * @access  Private
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }
    
    const users = await User.find({
      $or: [
        { nom: { $regex: q, $options: 'i' } },
        { prenom: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ],
      statut_compte: 'ACTIF'
    })
    .limit(20)
    .select('nom prenom email photo_profil ville');
    
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error in searchUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche'
    });
  }
};

/**
 * @desc    Récupérer les amis mutuels
 * @route   GET /api/friends/mutual/:userId
 * @access  Private
 */
exports.getMutualFriends = async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    const { userId } = req.params;
    
    const currentUserFriends = await Friendship.getFriends(currentUserId);
    const otherUserFriends = await Friendship.getFriends(userId);
    
    const currentFriendIds = currentUserFriends.map(f => f._id.toString());
    const mutualFriends = otherUserFriends.filter(f => 
      currentFriendIds.includes(f._id.toString())
    );
    
    res.status(200).json({
      success: true,
      data: mutualFriends
    });
  } catch (error) {
    console.error('Error in getMutualFriends:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des amis mutuels'
    });
  }
};

/**
 * @desc    Bloquer un utilisateur
 * @route   POST /api/friends/block
 * @access  Private
 */
exports.blockUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { userId: targetUserId } = req.body;
    
    // Supprimer l'amitié si elle existe
    await Friendship.findOneAndDelete({
      $or: [
        { user1: userId, user2: targetUserId },
        { user1: targetUserId, user2: userId }
      ]
    });
    
    // Créer une entrée de blocage
    const block = await Friendship.create({
      user1: userId,
      user2: targetUserId,
      status: 'blocked',
      initiator: userId,
      created_by: userId
    });
    
    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      data: block
    });
  } catch (error) {
    console.error('Error in blockUser:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du blocage'
    });
  }
};

/**
 * @desc    Débloquer un utilisateur
 * @route   DELETE /api/friends/unblock/:userId
 * @access  Private
 */
exports.unblockUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { userId: targetUserId } = req.params;
    
    await Friendship.findOneAndDelete({
      user1: userId,
      user2: targetUserId,
      status: 'blocked'
    });
    
    res.status(200).json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Error in unblockUser:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du déblocage'
    });
  }
};

/**
 * @desc    Récupérer les utilisateurs bloqués
 * @route   GET /api/friends/blocked
 * @access  Private
 */
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // Utilisation d'une approche plus robuste sans populate()
    const blocked = await Friendship.find({
      user1: userId,
      status: 'blocked'
    }).lean();
    
    // Récupérer les IDs des utilisateurs bloqués
    const blockedUserIds = blocked.map(b => b.user2);
    
    // Récupérer les détails des utilisateurs dans une requête séparée
    const blockedUsers = await User.find({
      _id: { $in: blockedUserIds }
    })
    .select('nom prenom email photo_profil')
    .lean();
    
    res.status(200).json({
      success: true,
      data: blockedUsers
    });
  } catch (error) {
    console.error('Error in getBlockedUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs bloqués'
    });
  }
};

/**
 * @desc    Récupérer les groupes d'amis de l'utilisateur
 * @route   GET /api/friends/groups
 * @access  Private
 */
exports.getFriendGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // Récupérer les groupes dont l'utilisateur est propriétaire
    const groups = await FriendGroup.find({ owner: userId })
      .lean();
    
    // Pour chaque groupe, récupérer les détails des membres
    const enrichedGroups = [];
    for (const group of groups) {
      // Récupérer les détails des membres en une seule requête
      const members = await User.find({
        _id: { $in: group.members }
      })
      .select('_id nom prenom email photo_profil')
      .lean();
      
      enrichedGroups.push({
        ...group,
        members
      });
    }
    
    res.status(200).json({
      success: true,
      data: enrichedGroups
    });
  } catch (error) {
    console.error('Error in getFriendGroups:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des groupes d\'amis'
    });
  }
};

/**
 * @desc    Créer un groupe d'amis
 * @route   POST /api/friends/groups
 * @access  Private
 */
exports.createFriendGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, description, color, members = [] } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }
    
    // Créer le groupe
    const group = await FriendGroup.create({
      name,
      description,
      color: color || '#b31217',
      owner: userId,
      members,
      created_by: userId
    });
    
    res.status(201).json({
      success: true,
      message: 'Friend group created successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in createFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du groupe d\'amis'
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
    const { name, description, color, members } = req.body;
    
    // Vérifier que l'utilisateur est le propriétaire du groupe
    const group = await FriendGroup.findOne({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Friend group not found or you are not the owner'
      });
    }
    
    // Mettre à jour les champs
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (color) group.color = color;
    if (members) group.members = members;
    
    group.modified_date = Date.now();
    group.modified_by = userId;
    
    await group.save();
    
    res.status(200).json({
      success: true,
      message: 'Friend group updated successfully',
      data: group
    });
  } catch (error) {
    console.error('Error in updateFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du groupe d\'amis'
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
    
    // Vérifier que l'utilisateur est le propriétaire du groupe
    const group = await FriendGroup.findOneAndDelete({
      _id: groupId,
      owner: userId
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Friend group not found or you are not the owner'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Friend group deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteFriendGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du groupe d\'amis'
    });
  }
};

module.exports = exports;