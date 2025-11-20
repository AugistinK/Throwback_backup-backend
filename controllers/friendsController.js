// controllers/friendsController.js - 
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

const EXCLUDED_ROLES = ['admin', 'superadmin'];

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
        _id: request._id.toString(),              
        friendshipId: request._id.toString(),     
        senderId: sender._id.toString(),          
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

    // Récupérer l'utilisateur courant
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Les comptes admin/superadmin sont exclus du système d’amis
    if (EXCLUDED_ROLES.includes(currentUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Les comptes administrateurs sont exclus du système d’amis'
      });
    }
    
    //  Récupérer les IDs des relations existantes (amis, pending, blocked, etc.)
    const existingFriendships = await Friendship.find({
      $or: [
        { requester: userId },
        { receiver: userId }
      ]
    });
    
    const excludedIdsSet = new Set();
    excludedIdsSet.add(String(userId));

    existingFriendships.forEach(f => {
      const requesterId = String(f.requester);
      const receiverId = String(f.receiver);
      const otherId = requesterId === String(userId) ? receiverId : requesterId;
      excludedIdsSet.add(otherId);
    });

    const excludedIds = Array.from(excludedIdsSet);

    // Suggestions basées sur la ville
    const suggestions = await User.find({
      _id: { $nin: excludedIds },
      ville: currentUser.ville,
      statut_compte: 'ACTIF',
      role: { $nin: EXCLUDED_ROLES }   // Exclure admin et superadmin
    })
    .limit(50)
    .select('nom prenom email photo_profil ville role')
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
 * @route   POST /api/friends/request
 * @access  Private
 */
exports.sendFriendRequest = async (req, res, next) => {
  try {
    const requester = req.user && (req.user._id || req.user.id);
    const { friendId } = req.body;

    if (!friendId) {
      return res.status(400).json({ success: false, message: 'friendId est requis' });
    }

    if (!mongoose.Types.ObjectId.isValid(requester) ||
        !mongoose.Types.ObjectId.isValid(friendId) ||
        String(requester) === String(friendId)) {
      return res.status(400).json({ success:false, message:'IDs invalides' });
    }

    // Récupérer les profils des deux utilisateurs
    const [requesterUser, targetUser] = await Promise.all([
      User.findById(requester),
      User.findById(friendId)
    ]);

    if (!requesterUser || !targetUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    // Les comptes admin/superadmin sont exclus du système d’amis
    if (EXCLUDED_ROLES.includes(requesterUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Les comptes administrateurs ne peuvent pas utiliser le système d’amis'
      });
    }

    if (EXCLUDED_ROLES.includes(targetUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas envoyer une demande à un compte administrateur'
      });
    }

    if (targetUser.statut_compte !== 'ACTIF') {
      return res.status(400).json({
        success: false,
        message: 'Le compte cible n’est pas actif'
      });
    }

    // Vérifier s'il existe déjà une relation entre les deux utilisateurs
    const existing = await Friendship.findOne({
      $or: [
        { requester, receiver: friendId },
        { requester: friendId, receiver: requester }
      ]
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({
          success: false,
          message: 'Vous êtes déjà amis avec cet utilisateur'
        });
      }

      if (existing.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Une demande d’ami est déjà en attente avec cet utilisateur'
        });
      }

      if (existing.status === 'blocked') {
        return res.status(403).json({
          success: false,
          message: 'L’un des utilisateurs a bloqué l’autre'
        });
      }
    }

    // Créer une nouvelle demande d’ami
    const doc = await Friendship.create({
      requester,
      receiver: friendId,
      status: 'pending',
      created_by: String(requester)
    });

    return res.status(201).json({ success:true, data: doc });
  } catch (e) { 
    return next(e); 
  }
};

/**
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
    const currentUserId = req.user.id || req.user._id;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    // Exclure les relations déjà existantes (amis, pending, blocked, etc.)
    const existingFriendships = await Friendship.find({
      $or: [
        { requester: currentUserId },
        { receiver: currentUserId }
      ]
    });

    const excludedIdsSet = new Set();
    excludedIdsSet.add(String(currentUserId));

    existingFriendships.forEach(f => {
      const requesterId = String(f.requester);
      const receiverId = String(f.receiver);
      const otherId = requesterId === String(currentUserId) ? receiverId : requesterId;
      excludedIdsSet.add(otherId);
    });

    const excludedIds = Array.from(excludedIdsSet);
    
    const users = await User.find({
      _id: { $nin: excludedIds },
      $or: [
        { nom: { $regex: q, $options: 'i' } },
        { prenom: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ],
      statut_compte: 'ACTIF',
      role: { $nin: EXCLUDED_ROLES }    // Exclure admin/superadmin
    })
    .limit(20)
    .select('nom prenom email photo_profil ville role');
    
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
 * @desc    Débloquer un utilisateur précédemment bloqué
 * @route   DELETE /api/friends/unblock/:userId
 * @access  Private
 */
exports.unblockUser = async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    const { userId: targetUserId } = req.params;

    // 1) Validation de l'id cible
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // 2) Vérifier qu’il existe bien une relation de blocage
    const blockedRelation = await Friendship.findOneAndDelete({
      requester: currentUserId,   // celui qui a bloqué
      receiver: targetUserId,     // celui qui est bloqué
      status: 'blocked'
    });

    if (!blockedRelation) {
      return res.status(404).json({
        success: false,
        message: 'Aucun blocage trouvé pour cet utilisateur'
      });
    }

    // 3) (Optionnel) Log de l’action de déblocage
    await LogAction.create({
      type_action: 'FRIEND_UNBLOCKED',
      description_action: `User ${currentUserId} unblocked user ${targetUserId}`,
      id_user: currentUserId,
      created_by: 'SYSTEM'
    });

    return res.status(200).json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Error in unblockUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du déblocage'
    });
  }
};


/**
 * @desc   Récupérer les utilisateurs bloqués par l'utilisateur connecté
 * @route  GET /api/friends/blocked
 * @access Private
 */
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // On cherche toutes les relations où l'utilisateur courant est le bloqueur
    const blocked = await Friendship.find({
      requester: userId,
      status: 'blocked'
    }).populate('receiver', 'nom prenom email photo_profil');

    // On retourne uniquement les infos de l'utilisateur bloqué
    const blockedUsers = blocked.map(b => b.receiver);

    return res.status(200).json({
      success: true,
      data: blockedUsers
    });
  } catch (error) {
    console.error('Error in getBlockedUsers:', error);
    return res.status(500).json({
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
