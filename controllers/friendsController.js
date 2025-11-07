// controllers/friendsController.js - VERSION CORRIGÉE
const Friendship = require('../models/Friendship');
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
 *  CORRECTION CRITIQUE: Récupérer les demandes d'amis en attente
 * @route   GET /api/friends/requests
 * @access  Private
 */
exports.getFriendRequests = async (req, res) => {
  try {
    console.log('Starting getFriendRequests function');
    const userId = req.user.id || req.user._id;
    console.log('User ID:', userId, 'Type:', typeof userId);

    //  Utiliser la nouvelle méthode statique
    const requests = await Friendship.getReceivedRequests(userId);
    console.log('Found friend requests:', requests.length);

    //  CORRECTION: Formater correctement avec friendshipId et senderId séparés
    const formattedRequests = requests.map(request => {
      const sender = request.requester;
      
      return {
        _id: request._id.toString(),              //  ID du document Friendship
        friendshipId: request._id.toString(),     //  Alias pour clarté
        senderId: sender._id.toString(),          //  ID de l'expéditeur séparé
        nom: sender.nom || 'Utilisateur inconnu',
        prenom: sender.prenom || '',
        email: sender.email || '',
        photo_profil: sender.photo_profil || null,
        ville: sender.ville || null,
        requestDate: request.created_date
      };
    });

    console.log('Successfully formatted requests, count:', formattedRequests.length);
    
    res.status(200).json({
      success: true,
      data: formattedRequests
    });
  } catch (error) {
    console.error('Error in getFriendRequests:', error);
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
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    //  Récupérer les IDs des amis existants et demandes en cours
    const existingFriendships = await Friendship.find({
      $or: [
        { requester: userId },
        { receiver: userId }
      ]
    });
    
    const excludedIds = existingFriendships.map(f => 
      f.requester.toString() === userId.toString() ? f.receiver : f.requester
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
      _id: user._id.toString(),
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
 *  CORRECTION: Envoyer une demande d'ami
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
    
    //  Vérifier si une relation existe déjà
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: userId, receiver: friendId },
        { requester: friendId, receiver: userId }
      ]
    });
    
    if (existingFriendship) {
      let message = 'Friend request already exists';
      if (existingFriendship.status === 'accepted') {
        message = 'You are already friends';
      } else if (existingFriendship.status === 'blocked') {
        message = 'Cannot send friend request';
      }
      
      return res.status(400).json({
        success: false,
        message
      });
    }
    
    //  Créer la demande avec la nouvelle structure
    const friendship = await Friendship.create({
      requester: userId,
      receiver: friendId,
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
 *  CORRECTION CRITIQUE: Accepter une demande d'ami
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

    //  Vérifier que l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friendship ID'
      });
    }
      
    //  CORRECTION: Chercher par receiver (celui qui reçoit la demande)
    const friendship = await Friendship.findOne({
      _id: friendshipId,
      receiver: userId,
      status: 'pending'
    });
    
    if (!friendship) {
      console.log(`Friendship not found: ${friendshipId} for user ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }
    
    //  Accepter la demande
    friendship.status = 'accepted';
    friendship.modified_date = Date.now();
    friendship.modified_by = userId;
    await friendship.save();
    
    // Log action
    await LogAction.create({
      type_action: 'FRIEND_REQUEST_ACCEPTED',
      description_action: `Friend request accepted from user ${friendship.requester}`,
      id_user: userId,
      created_by: 'SYSTEM'
    });
    
    console.log(` Friend request accepted successfully`);
    
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
 *  CORRECTION: Refuser une demande d'ami
 * @route   DELETE /api/friends/reject/:friendshipId
 * @access  Private
 */
exports.rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendshipId } = req.params;
    
    //  Vérifier que l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friendship ID'
      });
    }
    
    //  CORRECTION: Chercher par receiver
    const friendship = await Friendship.findOneAndDelete({
      _id: friendshipId,
      receiver: userId,
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
      description_action: `Friend request rejected from user ${friendship.requester}`,
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
 *  CORRECTION: Retirer un ami
 * @route   DELETE /api/friends/remove/:friendId
 * @access  Private
 */
exports.removeFriend = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { friendId } = req.params;
    
    //  Vérifier que l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID'
      });
    }
    
    //  CORRECTION: Chercher avec requester/receiver
    const friendship = await Friendship.findOneAndDelete({
      $or: [
        { requester: userId, receiver: friendId },
        { requester: friendId, receiver: userId }
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
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }
    
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
 *  CORRECTION: Bloquer un utilisateur
 * @route   POST /api/friends/block
 * @access  Private
 */
exports.blockUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { userId: targetUserId } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }
    
    //  Supprimer l'amitié si elle existe
    await Friendship.findOneAndDelete({
      $or: [
        { requester: userId, receiver: targetUserId },
        { requester: targetUserId, receiver: userId }
      ]
    });
    
    //  Créer une entrée de blocage
    const block = await Friendship.create({
      requester: userId,
      receiver: targetUserId,
      status: 'blocked',
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
 *  CORRECTION: Débloquer un utilisateur
 * @route   DELETE /api/friends/unblock/:userId
 * @access  Private
 */
exports.unblockUser = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { userId: targetUserId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }
    
    await Friendship.findOneAndDelete({
      requester: userId,
      receiver: targetUserId,
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
 *  CORRECTION: Récupérer les utilisateurs bloqués
 * @route   GET /api/friends/blocked
 * @access  Private
 */
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const blocked = await Friendship.find({
      requester: userId,
      status: 'blocked'
    }).populate('receiver', 'nom prenom email photo_profil');
    
    const blockedUsers = blocked.map(b => b.receiver);
    
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
 *  NOUVEAU: Obtenir les statistiques d'amitié
 * @route   GET /api/friends/stats
 * @access  Private
 */
exports.getFriendshipStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const [friendsCount, pendingRequestsCount, sentRequestsCount] = await Promise.all([
      Friendship.countDocuments({
        $or: [
          { requester: userId, status: 'accepted' },
          { receiver: userId, status: 'accepted' }
        ]
      }),
      Friendship.countDocuments({
        receiver: userId,
        status: 'pending'
      }),
      Friendship.countDocuments({
        requester: userId,
        status: 'pending'
      })
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        friends: friendsCount,
        pendingRequests: pendingRequestsCount,
        sentRequests: sentRequestsCount
      }
    });
  } catch (error) {
    console.error('Error in getFriendshipStats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

module.exports = exports;