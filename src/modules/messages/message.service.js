import Message from '../../models/Message.js';
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';
import AppError from '../../core/errors/AppError.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';
import { emitMessage, emitMessageEdited, emitMessageDeleted } from '../../sockets/index.js';
import { notifyUser } from '../notifications/notification.service.js';

class MessageService {
  async createConversation(userId, data) {
    const { participantId, jobId, proposalId, contractId } = data;

    const participant = await User.findById(participantId);
    if (!participant) {
      throw AppError('Participant not found', 404);
    }

    if (participantId === userId.toString()) {
      throw AppError('Cannot create conversation with yourself', 400);
    }

    const context = {};
    if (jobId) context.job = jobId;
    if (proposalId) context.proposal = proposalId;
    if (contractId) context.contract = contractId;

    const conversation = await Conversation.findOrCreate(
      [userId, participantId],
      context
    );

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'CONVERSATION_CREATED',
    //   targetType: 'Conversation',
    //   targetId: conversation._id.toString(),
    //   details: { participantId, ...context },
    // });

    return conversation;
  }

  async getConversations(userId, options = {}) {
    const conversations = await Conversation.findByUser(userId, options);

    // Sort: pinned conversations first, then by lastMessageAt
    const sorted = conversations.sort((a, b) => {
      const aPinned = a.isPinnedBy(userId);
      const bPinned = b.isPinnedBy(userId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const aDate = new Date(a.lastMessageAt || 0);
      const bDate = new Date(b.lastMessageAt || 0);
      return bDate - aDate;
    });

    return sorted.map((conv) => ({
      ...conv.toObject(),
      unreadCount: conv.getUnreadCount(userId),
      pinnedBy: conv.pinnedBy || [],
      mutedBy: conv.mutedBy || [],
      archivedBy: conv.archivedBy || [],
    }));
  }

  async getConversationById(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'name avatar email role')
      .populate('job', 'title description budget')
      .populate({
        path: 'proposal',
        select: 'status bidAmount coverLetter freelancerId jobId',
        populate: [
          { path: 'freelancerId', select: 'name avatar email' },
          { path: 'jobId', select: 'title description budget' }
        ]
      })
      .populate('contract', 'status title totalAmount paymentType milestones startDate')
      .populate('lastMessage');

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    return {
      ...conversation.toObject(),
      unreadCount: conversation.getUnreadCount(userId),
    };
  }

  async sendMessage(conversationId, senderId, messageData, files = []) {
    console.log('💬 [sendMessage] Service called with:', {
      conversationId,
      senderId,
      messageData: { ...messageData, content: messageData.content?.substring(0, 50) + '...' },
      filesCount: files.length,
      embeds: messageData.embeds
    });

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(senderId)) {
      throw AppError('You are not a participant in this conversation', 403);
    }

    const attachments = files.map((file) => ({
      fileName: file.originalname,
      fileUrl: file.path,
      fileType: file.mimetype,
      fileSize: file.size,
      mimeType: file.mimetype,
    }));

    const message = new Message({
      conversation: conversationId,
      sender: senderId,
      content: messageData.content || (messageData.embeds?.length > 0 ? 'Shared a video' : ''),
      type: files.length > 0 || (messageData.embeds && messageData.embeds.length > 0) ? 'file' : 'text',
      attachments,
      replyTo: messageData.replyTo,
      embeds: messageData.embeds || [],
    });

    console.log('📦 [sendMessage] Saving message with embeds:', messageData.embeds);
    await message.save();
    await message.markAsRead(senderId);

    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== senderId.toString()) {
        conversation.incrementUnread(participantId);
        
        // If conversation was deleted by recipient, restore it (remove from deletedBy)
        // This allows the conversation to reappear when a new message is sent
        if (conversation.deletedBy.some(id => id.toString() === participantId.toString())) {
          conversation.deletedBy = conversation.deletedBy.filter(
            (id) => id.toString() !== participantId.toString()
          );
        }
      }
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    
    // If conversation was deleted by sender, restore it (remove from deletedBy)
    if (conversation.deletedBy.some(id => id.toString() === senderId.toString())) {
      conversation.deletedBy = conversation.deletedBy.filter(
        (id) => id.toString() !== senderId.toString()
      );
    }
    
    await conversation.save();

    await message.populate('sender', 'name avatar email');
    if (message.replyTo) {
      await message.populate('replyTo', 'content sender');
    }

    // Emit socket event
    emitMessage(conversationId, message.toObject(), senderId);

    // Persist & emit a notification to the other participants
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== senderId.toString()) {
        try {
          notifyUser(participantId, {
            type: 'message_received',
            title: 'New message',
            message: `${message.sender.name || 'Someone'}: ${message.content?.substring(0,120)}`,
            link: `/messages/${conversationId}`,
            data: { conversationId, messageId: message._id }
          });
        } catch (err) {
          console.error('[Notification] failed to notify participant', participantId, err.message);
        }
      }
    });

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: senderId,
    //   action: 'MESSAGE_SENT',
    //   targetType: 'Message',
    //   targetId: message._id.toString(),
    //   details: { conversationId, hasAttachments: attachments.length > 0 },
    // });

    return message;
  }

  async getMessages(conversationId, userId, options = {}) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 50;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.findByConversation(conversationId, {
        limit,
        skip,
        order: options.order,
        userId, // Pass userId to filter deletedBy
      }),
      Message.countDocuments({ 
        conversation: conversationId, 
        isDeleted: false,
        deletedBy: { $nin: [userId] },
      }),
    ]);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    await Message.markAllAsRead(conversationId, userId);
    conversation.resetUnread(userId);
    await conversation.save();

    return { success: true };
  }

  async editMessage(conversationId, messageId, userId, newContent) {
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      throw AppError('Message not found', 404);
    }

    if (!message.canBeModifiedBy(userId)) {
      throw AppError('You can only edit your own messages', 403);
    }

    if (message.isDeleted) {
      throw AppError('Cannot edit deleted message', 400);
    }

    await message.edit(newContent);

    // Emit socket event
    emitMessageEdited(conversationId, message.toObject());

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'MESSAGE_EDITED',
    //   targetType: 'Message',
    //   targetId: message._id.toString(),
    //   details: { conversationId },
    // });

    return message;
  }

  async deleteMessage(conversationId, messageId, userId) {
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    });

    if (!message) {
      throw AppError('Message not found', 404);
    }

    // Check if already deleted by this user
    const isOwnMessage = message.sender.toString() === userId.toString();
    const alreadyDeletedByUser = message.deletedBy.some(
      (id) => id.toString() === userId.toString()
    );

    if (isOwnMessage && message.isDeleted) {
      throw AppError('Message already deleted', 400);
    }

    if (!isOwnMessage && alreadyDeletedByUser) {
      throw AppError('Message already deleted', 400);
    }

    await message.softDelete(userId);

    // Emit socket event with userId to update only the deleting user's view
    emitMessageDeleted(conversationId, messageId, userId);

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'MESSAGE_DELETED',
    //   targetType: 'Message',
    //   targetId: message._id.toString(),
    //   details: { conversationId, isOwnMessage },
    // });

    return message;
  }

  async archiveConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    if (!conversation.archivedBy.includes(userId)) {
      conversation.archivedBy.push(userId);
      await conversation.save();
    }

    return conversation;
  }

  async unarchiveConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    conversation.archivedBy = conversation.archivedBy.filter(
      (id) => id.toString() !== userId.toString()
    );
    await conversation.save();

    return conversation;
  }

  async searchMessages(conversationId, userId, searchTerm) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    const messages = await Message.searchInConversation(
      conversationId,
      searchTerm,
      userId
    );

    return messages;
  }

  async getUnreadCount(userId) {
    const conversations = await Conversation.find({
      participants: userId,
      isActive: true,
    });

    let totalUnread = 0;
    conversations.forEach((conv) => {
      totalUnread += conv.getUnreadCount(userId);
    });

    return totalUnread;
  }

  async pinConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    // Check if already pinned
    if (conversation.pinnedBy.some(id => id.toString() === userId.toString())) {
      return conversation; // Already pinned, return as is
    }

    // Check if user has already pinned 3 conversations
    const userPinnedConversations = await Conversation.find({
      participants: userId,
      isActive: true,
      pinnedBy: userId,
    });

    if (userPinnedConversations.length >= 3) {
      throw AppError('You can only pin up to 3 conversations', 400);
    }

    conversation.pinnedBy.push(userId);
    await conversation.save();

    return conversation;
  }

  async unpinConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    conversation.pinnedBy = conversation.pinnedBy.filter(
      (id) => id.toString() !== userId.toString()
    );
    await conversation.save();

    return conversation;
  }

  async muteConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    if (!conversation.mutedBy.includes(userId)) {
      conversation.mutedBy.push(userId);
      await conversation.save();
    }

    return conversation;
  }

  async unmuteConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    conversation.mutedBy = conversation.mutedBy.filter(
      (id) => id.toString() !== userId.toString()
    );
    await conversation.save();

    return conversation;
  }

  async deleteConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      throw AppError('Conversation not found', 404);
    }

    if (!conversation.isParticipant(userId)) {
      throw AppError('You do not have access to this conversation', 403);
    }

    // Per-user soft delete: add userId to deletedBy array
    if (!conversation.deletedBy.includes(userId)) {
      conversation.deletedBy.push(userId);
      await conversation.save();
    }

    return conversation;
  }
}

export default new MessageService();
