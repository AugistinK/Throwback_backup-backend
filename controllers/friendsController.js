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
    console.log('Starting getFriendRequests function');
    const userId = req.user.id || req.user._id;
    console.log('User ID:', userId, 'Type:', typeof userId);

    // Convertir userId en string pour éviter les problèmes de casting
    const userIdStr = userId.toString();
    console.log('UserID as string:', userIdStr);

    // Approche sans populate pour éviter les erreurs _doc
    let requests;
    try {
      requests = await Friendship.find({
        user2: userIdStr,
        status: 'pending'
      }).sort({ created_date: -1 });
      console.log('Found friend requests:', requests.length);
    } catch (findError) {
      console.error('Error in friendship find:', findError);
      // Fallback avec MongoDB natif si Mongoose échoue
      const db = mongoose.connection.db;
      const friendshipCollection = db.collection('friendships');
      const rawRequests = await friendshipCollection.find({
        user2: userIdStr,
        status: 'pending'
      }).sort({ created_date: -1 }).toArray();
      
      requests = rawRequests;
      console.log('Using MongoDB native fallback, found:', requests.length);
    }

    // Préparer le résultat sans aucun populate
    const formattedRequests = [];
    
    for (const request of requests) {
      // Récupérer l'ID de l'expéditeur de la demande
      const senderId = request.user1 ? request.user1.toString() : null;
      console.log('Processing request from sender ID:', senderId);
      
      if (!senderId) {
        console.log('No valid sender ID found, using default values');
        formattedRequests.push({
          friendshipId: request._id.toString(),
          _id: 'unknown',
          nom: 'Utilisateur inconnu',
          prenom: '',
          email: '',
          photo_profil: null,
          ville: null,
          requestDate: request.created_date
        });
        continue;
      }

      // Récupérer les données de l'expéditeur séparément
      let sender;
      try {
        sender = await User.findById(senderId)
          .select('nom prenom email photo_profil ville')
          .lean(); // Utiliser lean() pour obtenir un objet JavaScript pur
        
        console.log('Sender found:', sender ? 'yes' : 'no');
      } catch (userError) {
        console.error('Error finding sender:', userError);
        sender = null;
      }

      // Construire l'objet avec des valeurs par défaut sécurisées
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

    console.log('Successfully formatted requests, count:', formattedRequests.length);
    
    res.status(200).json({
      success: true,
      data: formattedRequests
    });
  } catch (error) {
    console.error('Error in getFriendRequests (detailed):', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
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
    const friendshipObjectId = mongoose.Types.ObjectId.isValid(friendshipId)
      ? new mongoose.Types.ObjectId(friendshipId)
      : friendshipId;
      
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
    
    const blocked = await Friendship.find({
      user1: userId,
      status: 'blocked'
    }).populate('user2', 'nom prenom email photo_profil');
    
    const blockedUsers = blocked.map(b => b.user2);
    
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

module.exports = exports;