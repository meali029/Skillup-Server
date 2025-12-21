import Joi from 'joi';

// Create conversation
export const createConversation = {
  body: Joi.object({
    participantId: Joi.string().required().hex().length(24),
    jobId: Joi.string().optional().hex().length(24),
    proposalId: Joi.string().optional().hex().length(24),
    contractId: Joi.string().optional().hex().length(24),
  }),
};

// Get conversations
export const getConversations = {
  query: Joi.object({
    includeArchived: Joi.boolean().default(false),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),
};

// Get conversation by ID
export const getConversation = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
};

// Send message
export const sendMessage = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    content: Joi.string().allow('').optional().trim().max(5000),
    replyTo: Joi.string().optional().hex().length(24),
    embeds: Joi.alternatives().try(
      Joi.string().optional(), // Allow string (JSON) format from form data
      Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          url: Joi.string().required(),
          title: Joi.string().optional(),
        })
      ).optional()
    ).optional(),
  }),
};

// Get messages
export const getMessages = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

// Mark as read
export const markAsRead = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
  }),
};

// Edit message
export const editMessage = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
    messageId: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    content: Joi.string().required().trim().min(1).max(5000),
  }),
};

// Delete message
export const deleteMessage = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
    messageId: Joi.string().required().hex().length(24),
  }),
};

// Archive conversation
export const archiveConversation = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
};

// Search messages
export const searchMessages = {
  params: Joi.object({
    conversationId: Joi.string().required().hex().length(24),
  }),
  query: Joi.object({
    query: Joi.string().required().trim().min(2),
  }),
};
