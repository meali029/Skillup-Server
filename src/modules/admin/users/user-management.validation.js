import Joi from 'joi';
import { validate } from '../../../core/middlewares/index.js';

// Validate user query parameters
const userQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  role: Joi.string().valid('freelancer', 'client', 'admin'),
  status: Joi.string().valid('active', 'suspended', 'banned'),
  isVerified: Joi.string().valid('true', 'false'),
  search: Joi.string().max(100),
  sortBy: Joi.string().valid('name', 'email', 'createdAt', 'totalEarnings', 'totalSpent'),
  sortOrder: Joi.string().valid('asc', 'desc'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),
  format: Joi.string().valid('excel', 'csv'),
});

// Validate user action (suspend/ban)
const userActionSchema = Joi.object({
  reason: Joi.string().required().min(10).max(500).messages({
    'string.empty': 'Reason is required',
    'string.min': 'Reason must be at least 10 characters',
    'string.max': 'Reason cannot exceed 500 characters',
  }),
});

export const validateUserQuery = validate(userQuerySchema, 'query');
export const validateUserAction = validate(userActionSchema);
