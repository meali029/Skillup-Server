import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

let io;

// Initialize Socket.io server
export const initializeSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5174',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      // Check if user is banned or suspended
      if (user.isBanned || !user.isActive) {
        return next(new Error('Account is not active'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.userName = user.name;
      
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Handle connections
  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.userName} (${socket.userId})`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Join role-specific rooms
    if (socket.userRole === 'freelancer') {
      socket.join('freelancers');
      socket.join('jobs'); // For job browsing updates
    } else if (socket.userRole === 'client') {
      socket.join('clients');
    } else if (socket.userRole === 'admin') {
      socket.join('admins');
    }

    // Send connection confirmation
    socket.emit('connected', {
      userId: socket.userId,
      role: socket.userRole,
      message: 'Socket connection established',
    });

    // Handle job room subscriptions
    socket.on('subscribe:job', (jobId) => {
      socket.join(`job:${jobId}`);
      console.log(`[Socket] User ${socket.userId} subscribed to job ${jobId}`);
    });

    socket.on('unsubscribe:job', (jobId) => {
      socket.leave(`job:${jobId}`);
      console.log(`[Socket] User ${socket.userId} unsubscribed from job ${jobId}`);
    });

    // Handle chat room joins (existing functionality)
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`[Socket] 🚪 User ${socket.userName} (${socket.userId}) joined conversation ${conversationId}`);
      
      // Send confirmation back to client
      socket.emit('conversation:joined', { conversationId, success: true });
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`[Socket] User ${socket.userId} left conversation ${conversationId}`);
    });

    // Handle typing indicators
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user:typing', {
        conversationId,
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user:stopped_typing', {
        conversationId,
        userId: socket.userId,
      });
    });

    // Handle message read receipts
    socket.on('message:read', ({ conversationId, messageIds }) => {
      socket.to(`conversation:${conversationId}`).emit('messages:read', {
        conversationId,
        messageIds,
        readBy: socket.userId,
        readAt: new Date(),
      });
    });

    // Handle user presence
    socket.on('presence:update', (status) => {
      // Broadcast to all user's conversations
      socket.broadcast.emit('user:presence', {
        userId: socket.userId,
        status, // 'online', 'away', 'busy'
        lastSeen: new Date(),
      });
    });

    socket.on('disconnect', () => {
      // Broadcast offline status
      socket.broadcast.emit('user:presence', {
        userId: socket.userId,
        status: 'offline',
        lastSeen: new Date(),
      });
      console.log(`[Socket] User disconnected: ${socket.userName} (${socket.userId})`);
    });
  });

  console.log('[Socket] Socket.io server initialized');
  return io;
};

// Get Socket.io instance
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Emit job moderation events
export const emitJobEvent = (eventName, data) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized, skipping emit');
    return;
  }

  const { jobId, clientId, action, job, moderator, reason } = data;

  // Emit to job owner (client)
  if (clientId) {
    io.to(`user:${clientId}`).emit('job:moderation', {
      type: eventName,
      jobId,
      action,
      job: {
        _id: job?._id,
        title: job?.title,
        status: job?.status,
        moderationStatus: job?.moderationStatus,
        isFeatured: job?.isFeatured,
        isFlagged: job?.isFlagged,
      },
      moderator: {
        name: moderator?.name,
        role: moderator?.role,
      },
      reason,
      timestamp: new Date(),
    });
  }

  // Emit to all freelancers for job list updates
  io.to('freelancers').emit('jobs:update', {
    type: eventName,
    jobId,
    action,
    job: {
      _id: job?._id,
      title: job?.title,
      status: job?.status,
      moderationStatus: job?.moderationStatus,
      isFeatured: job?.isFeatured,
      isFlagged: job?.isFlagged,
    },
    timestamp: new Date(),
  });

  // Emit to users viewing this specific job
  io.to(`job:${jobId}`).emit('job:updated', {
    type: eventName,
    jobId,
    action,
    job,
    timestamp: new Date(),
  });
};

// Emit notification to specific user
export const emitUserNotification = (userId, notification) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized, skipping notification');
    return;
  }

  io.to(`user:${userId}`).emit('notification', notification);
};

// Emit to specific room
export const emitToRoom = (room, event, data) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized, skipping emit to room');
    return;
  }

  io.to(room).emit(event, data);
};

// Emit message to conversation
export const emitMessage = (conversationId, message, excludeUserId = null) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized, skipping message emit');
    return;
  }

  const event = 'message:new';
  const data = message;

  console.log(`[Socket] 📨 Emitting ${event} to conversation:${conversationId}`, {
    messageId: message._id,
    excludeUserId,
    sender: message.sender?._id || message.sender
  });

  if (excludeUserId) {
    // Emit to all in conversation except the sender
    io.to(`conversation:${conversationId}`).except(`user:${excludeUserId}`).emit(event, data);
  } else {
    // Emit to all in conversation
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
  
  console.log(`[Socket] ✅ Message emitted successfully`);
};

// Emit message edited event
export const emitMessageEdited = (conversationId, message) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized');
    return;
  }

  io.to(`conversation:${conversationId}`).emit('message:edited', {
    messageId: message._id,
    content: message.content,
    editedAt: message.editedAt || new Date(),
  });
};

// Emit message deleted event
export const emitMessageDeleted = (conversationId, messageId, userId = null) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized');
    return;
  }

  // If userId provided, emit only to that user (per-user deletion)
  // Otherwise emit to all participants (global deletion)
  if (userId) {
    io.to(`user:${userId}`).emit('message:deleted', {
      messageId,
      conversationId,
    });
  } else {
    io.to(`conversation:${conversationId}`).emit('message:deleted', {
      messageId,
      conversationId,
    });
  }
};

// Emit contract event
export const emitContractEvent = (contractId, eventType, data) => {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized');
    return;
  }

  const { clientId, freelancerId } = data;

  // Emit to both parties
  [clientId, freelancerId].forEach((userId) => {
    if (userId) {
      io.to(`user:${userId}`).emit('contract:updated', {
        contractId,
        eventType,
        data,
        timestamp: new Date(),
      });
    }
  });
};

export default {
  initializeSocketServer,
  getIO,
  emitJobEvent,
  emitUserNotification,
  emitToRoom,
  emitMessage,
  emitMessageEdited,
  emitMessageDeleted,
  emitContractEvent,
};
