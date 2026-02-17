import Joi from 'joi';

/**
 * Review Validation Schemas
 * 
 * Business Rules:
 * - Rating: 1-5 integer (required)
 * - Comment: max 2000 chars (optional)
 * - Contract must be completed before review
 * - Each party can only submit ONE review per contract
 */

// Submit a review for a completed contract
export const submitReview = {
  params: Joi.object({
    contractId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
        'any.required': 'Contract ID is required',
      }),
  }),
  body: Joi.object({
    rating: Joi.number().required().integer().min(1).max(5)
      .messages({
        'number.base': 'Rating must be a number',
        'number.integer': 'Rating must be a whole number',
        'number.min': 'Rating must be at least 1',
        'number.max': 'Rating cannot exceed 5',
        'any.required': 'Rating is required',
      }),
    comment: Joi.string().optional().trim().max(2000).allow('')
      .messages({
        'string.max': 'Comment cannot exceed 2000 characters',
      }),
  }),
};

// Get reviews for a user
export const getUserReviews = {
  params: Joi.object({
    userId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid user ID format',
        'string.length': 'Invalid user ID length',
        'any.required': 'User ID is required',
      }),
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1)
      .messages({
        'number.min': 'Page must be at least 1',
      }),
    limit: Joi.number().integer().min(1).max(50).default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 50',
      }),
    sort: Joi.string().valid('recent', 'highest', 'lowest').default('recent')
      .messages({
        'any.only': 'Sort must be one of: recent, highest, lowest',
      }),
  }),
};

// Get review status for a contract (check if user has reviewed)
export const getReviewStatus = {
  params: Joi.object({
    contractId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
        'any.required': 'Contract ID is required',
      }),
  }),
};
