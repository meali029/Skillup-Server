import messageService from './message.service.js';
import asyncHandler from '../../core/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../core/utils/responseFormatter.js';

export const createConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.createConversation(
    req.user.id,
    req.body
  );

  successResponse(res, { conversation }, 'Conversation created successfully', 201);
});

export const getConversations = asyncHandler(async (req, res) => {
  const { includeArchived, page, limit } = req.query;

  const conversations = await messageService.getConversations(req.user.id, {
    includeArchived,
    page,
    limit,
  });

  successResponse(res, { conversations }, 'Conversations retrieved successfully');
});

export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.getConversationById(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation retrieved successfully');
});

export const sendMessage = asyncHandler(async (req, res) => {
  console.log('📨 [sendMessage] Received request body:', req.body);
  console.log('📎 [sendMessage] Received files:', req.files?.length || 0);

  // Parse embeds if it's a string (from form data)
  if (req.body.embeds && typeof req.body.embeds === 'string') {
    console.log('🔗 [sendMessage] Parsing embeds string:', req.body.embeds);
    try {
      req.body.embeds = JSON.parse(req.body.embeds);
      console.log('✅ [sendMessage] Parsed embeds:', req.body.embeds);
    } catch (error) {
      console.log('❌ [sendMessage] Failed to parse embeds:', error.message);
      req.body.embeds = [];
    }
  } else if (req.body.embeds) {
    console.log('🔗 [sendMessage] Embeds already parsed:', req.body.embeds);
  } else {
    console.log('🔗 [sendMessage] No embeds in request');
  }

  const message = await messageService.sendMessage(
    req.params.conversationId,
    req.user.id,
    req.body,
    req.files || []
  );

  successResponse(res, { message }, 'Message sent successfully', 201);
});

export const getMessages = asyncHandler(async (req, res) => {
  const { page, limit, order } = req.query;

  const result = await messageService.getMessages(
    req.params.conversationId,
    req.user.id,
    { page, limit, order }
  );

  if (result.pagination) {
    paginatedResponse(
      res,
      result.messages,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total
    );
  } else {
    successResponse(res, { messages: result.messages }, 'Messages retrieved successfully');
  }
});

export const markAsRead = asyncHandler(async (req, res) => {
  const result = await messageService.markAsRead(
    req.params.conversationId,
    req.user.id
  );

  successResponse(res, result, 'Messages marked as read');
});

export const editMessage = asyncHandler(async (req, res) => {
  const message = await messageService.editMessage(
    req.params.conversationId,
    req.params.messageId,
    req.user.id,
    req.body.content
  );

  successResponse(res, { message }, 'Message edited successfully');
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await messageService.deleteMessage(
    req.params.conversationId,
    req.params.messageId,
    req.user.id
  );

  successResponse(res, { message }, 'Message deleted successfully');
});

export const archiveConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.archiveConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation archived successfully');
});

export const unarchiveConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.unarchiveConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation unarchived successfully');
});

export const searchMessages = asyncHandler(async (req, res) => {
  const { query } = req.query;

  const messages = await messageService.searchMessages(
    req.params.conversationId,
    req.user.id,
    query
  );

  successResponse(res, { messages }, 'Search results retrieved successfully');
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await messageService.getUnreadCount(req.user.id);

  successResponse(res, { count }, 'Unread count retrieved successfully');
});

export const pinConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.pinConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation pinned successfully');
});

export const unpinConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.unpinConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation unpinned successfully');
});

export const muteConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.muteConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation muted successfully');
});

export const unmuteConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.unmuteConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation unmuted successfully');
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await messageService.deleteConversation(
    req.params.id,
    req.user.id
  );

  successResponse(res, { conversation }, 'Conversation deleted successfully');
});