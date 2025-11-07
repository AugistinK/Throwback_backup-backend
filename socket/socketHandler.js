// socket/socketHandler.js - VERSION CORRIGÉE
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');

// Stockage en mémoire des utilisateurs connectés
const onlineUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

/**
 * Middleware d'authentification Socket.IO
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token missing'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-mot_de_passe');
    
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

/**
 * Initialiser Socket.IO
 */
const initializeSocketIO = (io) => {
  console.log('🔌 Initializing Socket.IO...');

  // Middleware d'authentification
  io.use(authenticateSocket);

  // Gestion des connexions
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const userName = `${socket.user.prenom} ${socket.user.nom}`;
    
    console.log(` User connected: ${userName} (${userId})`);

    // Ajouter l'utilisateur aux utilisateurs en ligne
    onlineUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);

    // Notifier tous les clients de la liste des utilisateurs en ligne
    io.emit('online-users', {
      users: Array.from(onlineUsers.keys()),
      count: onlineUsers.size
    });

    // Notifier les amis du changement de statut
    broadcastToFriends(socket, 'user-status-change', {
      userId,
      status: 'online',
      userName
    });

    // ============ GESTION DES MESSAGES ============

    /**
     * Rejoindre une conversation
     */
    socket.on('join-conversation', async ({ friendId }) => {
      try {
        const conversationRoom = [userId, friendId].sort().join('-');
        socket.join(conversationRoom);
        console.log(`💬 User ${userId} joined conversation with ${friendId}`);
      } catch (error) {
        console.error('Error joining conversation:', error);
      }
    });

    /**
     *  CORRECTION: Envoyer un message avec vérification d'amitié
     */
    socket.on('send-message', async (data) => {
      try {
        const { receiverId, content, type = 'text', tempId } = data;

        //  CORRECTION: Vérifier si les utilisateurs sont amis avec la nouvelle structure
        const areFriends = await Friendship.areFriends(userId, receiverId);
        if (!areFriends) {
          return socket.emit('message-error', { 
            error: 'You can only message your friends',
            tempId 
          });
        }

        // Créer le message dans la base de données
        const message = await Message.create({
          sender: userId,
          receiver: receiverId,
          content,
          type,
          created_by: userId
        });

        await message.populate('sender receiver', 'nom prenom photo_profil');

        // Envoyer au destinataire s'il est en ligne
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('new-message', {
            message: message,
            tempId
          });

          // Notifier le destinataire
          io.to(receiverSocketId).emit('new-message-notification', {
            senderId: userId,
            senderName: userName,
            content: content.substring(0, 50),
            timestamp: Date.now()
          });
        }

        // Confirmer au sender
        socket.emit('message-sent', {
          message: message,
          tempId
        });

        console.log(`📨 Message sent from ${userId} to ${receiverId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message-error', { 
          error: error.message,
          tempId: data.tempId 
        });
      }
    });

    /**
     * Indicateur de saisie
     */
    socket.on('typing-start', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          userId,
          userName,
          isTyping: true
        });
      }
    });

    socket.on('typing-stop', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          userId,
          userName,
          isTyping: false
        });
      }
    });

    /**
     * Marquer les messages comme lus
     */
    socket.on('mark-messages-read', async ({ friendId }) => {
      try {
        await Message.updateMany(
          {
            sender: friendId,
            receiver: userId,
            read: false
          },
          {
            read: true,
            readAt: new Date()
          }
        );

        // Notifier l'expéditeur
        const senderSocketId = onlineUsers.get(friendId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messages-read', {
            readerId: userId,
            readerName: userName
          });
        }

        console.log(`✓ Messages marked as read by ${userId}`);
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // ============ GESTION DES AMIS ============

    /**
     * Demande d'ami envoyée
     */
    socket.on('friend-request-sent', async ({ receiverId, senderName }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('friend-request-received', {
          senderId: userId,
          senderName: senderName || userName,
          timestamp: Date.now()
        });
        console.log(`🤝 Friend request sent from ${userId} to ${receiverId}`);
      }
    });

    /**
     * Demande d'ami acceptée
     */
    socket.on('friend-request-accepted', async ({ requesterId }) => {
      const requesterSocketId = onlineUsers.get(requesterId);
      if (requesterSocketId) {
        io.to(requesterSocketId).emit('friend-request-was-accepted', {
          acceptedBy: userId,
          acceptedByName: userName,
          timestamp: Date.now()
        });
        console.log(` Friend request accepted by ${userId} for ${requesterId}`);
      }
    });

    // ============ NOTIFICATIONS GÉNÉRALES ============

    /**
     * Notification de like sur post/vidéo/playlist
     */
    socket.on('send-like-notification', ({ targetUserId, contentType, contentTitle }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('notification', {
          type: 'like',
          userId,
          userName,
          contentType,
          contentTitle,
          message: `${userName} liked your ${contentType}`,
          timestamp: Date.now()
        });
      }
    });

    /**
     * Notification de commentaire
     */
    socket.on('send-comment-notification', ({ targetUserId, contentType, contentTitle }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('notification', {
          type: 'comment',
          userId,
          userName,
          contentType,
          contentTitle,
          message: `${userName} commented on your ${contentType}`,
          timestamp: Date.now()
        });
      }
    });

    // ============ GESTION LIVESTREAM ============

    /**
     * Rejoindre un livestream
     */
    socket.on('join-livestream', ({ streamId }) => {
      socket.join(`livestream-${streamId}`);
      io.to(`livestream-${streamId}`).emit('viewer-joined', {
        userId,
        userName,
        viewerCount: io.sockets.adapter.rooms.get(`livestream-${streamId}`)?.size || 0
      });
      console.log(`📺 User ${userId} joined livestream ${streamId}`);
    });

    /**
     * Quitter un livestream
     */
    socket.on('leave-livestream', ({ streamId }) => {
      socket.leave(`livestream-${streamId}`);
      io.to(`livestream-${streamId}`).emit('viewer-left', {
        userId,
        viewerCount: io.sockets.adapter.rooms.get(`livestream-${streamId}`)?.size || 0
      });
      console.log(`📺 User ${userId} left livestream ${streamId}`);
    });

    /**
     * Message de chat livestream
     */
    socket.on('livestream-chat-message', ({ streamId, message }) => {
      io.to(`livestream-${streamId}`).emit('livestream-chat-message', {
        userId,
        userName,
        userAvatar: socket.user.photo_profil,
        message,
        timestamp: Date.now()
      });
    });

    // ============ DÉCONNEXION ============

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${userName} (${userId})`);

      // Retirer des utilisateurs en ligne
      onlineUsers.delete(userId);
      userSockets.delete(socket.id);

      // Notifier tous les clients
      io.emit('online-users', {
        users: Array.from(onlineUsers.keys()),
        count: onlineUsers.size
      });

      // Notifier les amis du changement de statut
      broadcastToFriends(socket, 'user-status-change', {
        userId,
        status: 'offline',
        userName
      });
    });
  });

  console.log(' Socket.IO initialized successfully');
  return io;
};

/**
 *  CORRECTION: Diffuser un événement aux amis de l'utilisateur
 */
async function broadcastToFriends(socket, event, data) {
  try {
    const userId = socket.userId;
    const friends = await Friendship.getFriends(userId);
    
    friends.forEach(friend => {
      const friendSocketId = onlineUsers.get(friend._id.toString());
      if (friendSocketId) {
        socket.to(friendSocketId).emit(event, data);
      }
    });
  } catch (error) {
    console.error('Error broadcasting to friends:', error);
  }
}

/**
 * Obtenir le nombre d'utilisateurs en ligne
 */
function getOnlineUsersCount() {
  return onlineUsers.size;
}

/**
 * Vérifier si un utilisateur est en ligne
 */
function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

/**
 * Obtenir tous les utilisateurs en ligne
 */
function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

module.exports = {
  initializeSocketIO,
  getOnlineUsersCount,
  isUserOnline,
  getOnlineUsers
};