import Joi from 'joi';
import {
  CONTRACT_STATUS,
  MILESTONE_STATUS,
} from './contract.constants.js';

// Create contract from proposal
export const createFromProposal = {
  body: Joi.object({
    proposalId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid proposal ID format',
        'string.length': 'Invalid proposal ID length',
        'any.required': 'Proposal ID is required',
      }),
    terms: Joi.string().optional().trim().min(10)
      .messages({
        'string.min': 'Terms must be at least 10 characters',
      }),
    deadline: Joi.date().optional().iso().min('now')
      .messages({
        'date.min': 'Deadline must be in the future',
      }),
    milestones: Joi.array()
      .items(
        Joi.object({
          title: Joi.string().required().trim().min(3).max(200)
            .messages({
              'string.min': 'Milestone title must be at least 3 characters',
              'string.max': 'Milestone title cannot exceed 200 characters',
              'any.required': 'Milestone title is required',
            }),
          description: Joi.string().optional().trim().max(1000)
            .messages({
              'string.max': 'Milestone description cannot exceed 1000 characters',
            }),
          amount: Joi.number().required().min(0.01)
            .messages({
              'number.min': 'Milestone amount must be greater than 0',
              'any.required': 'Milestone amount is required',
            }),
          dueDate: Joi.date().optional().iso().min('now')
            .messages({
              'date.min': 'Milestone due date must be in the future',
            }),
        })
      )
      .optional(),
    paymentData: Joi.object({
      paymentMethod: Joi.string().required().valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
        .messages({
          'any.required': 'Payment method is required',
          'any.only': 'Payment method must be JAZZCASH, EASYPAISA, or BANK_TRANSFER',
        }),
      customerData: Joi.object({
        email: Joi.string().optional().email(),
        name: Joi.string().optional().trim(),
        phone: Joi.string().optional().trim(),
      }).optional(),
    }).required()
      .messages({
        'any.required': 'Payment data is required',
      }),
  }),
};

// Update contract
export const updateContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
  }),
  body: Joi.object({
    terms: Joi.string().optional().trim().min(10)
      .messages({
        'string.min': 'Terms must be at least 10 characters',
      }),
    deadline: Joi.date().optional().iso().min('now')
      .messages({
        'date.min': 'Deadline must be in the future',
      }),
    status: Joi.string()
      .valid(...Object.values(CONTRACT_STATUS))
      .optional()
      .messages({
        'any.only': `Status must be one of: ${Object.values(CONTRACT_STATUS).join(', ')}`,
      }),
  }).min(1),
};

// Add milestone
export const addMilestone = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
  }),
  body: Joi.object({
    title: Joi.string().required().trim().min(3).max(200)
      .messages({
        'string.min': 'Milestone title must be at least 3 characters',
        'string.max': 'Milestone title cannot exceed 200 characters',
        'any.required': 'Milestone title is required',
      }),
    description: Joi.string().optional().trim().max(1000)
      .messages({
        'string.max': 'Milestone description cannot exceed 1000 characters',
      }),
    amount: Joi.number().required().min(0.01)
      .messages({
        'number.min': 'Milestone amount must be greater than 0',
        'any.required': 'Milestone amount is required',
      }),
    dueDate: Joi.date().optional().iso().min('now')
      .messages({
        'date.min': 'Milestone due date must be in the future',
      }),
  }),
};

// Update milestone
export const updateMilestone = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
    milestoneId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid milestone ID format',
        'string.length': 'Invalid milestone ID length',
      }),
  }),
  body: Joi.object({
    title: Joi.string().optional().trim().min(3).max(200)
      .messages({
        'string.min': 'Milestone title must be at least 3 characters',
        'string.max': 'Milestone title cannot exceed 200 characters',
      }),
    description: Joi.string().optional().trim().max(1000)
      .messages({
        'string.max': 'Milestone description cannot exceed 1000 characters',
      }),
    amount: Joi.number().optional().min(0.01)
      .messages({
        'number.min': 'Milestone amount must be greater than 0',
      }),
    dueDate: Joi.date().optional().iso().min('now')
      .messages({
        'date.min': 'Milestone due date must be in the future',
      }),
    status: Joi.string()
      .valid(...Object.values(MILESTONE_STATUS))
      .optional()
      .messages({
        'any.only': `Milestone status must be one of: ${Object.values(MILESTONE_STATUS).join(', ')}`,
      }),
    notes: Joi.string().optional().trim().max(500)
      .messages({
        'string.max': 'Milestone notes cannot exceed 500 characters',
      }),
  }).min(1)
    .messages({
      'object.min': 'At least one field must be provided for update',
    }),
};

// Query contracts
export const queryContracts = {
  query: Joi.object({
    status: Joi.string()
      .valid(...Object.values(CONTRACT_STATUS))
      .optional()
      .messages({
        'any.only': `Status must be one of: ${Object.values(CONTRACT_STATUS).join(', ')}`,
      }),
    role: Joi.string().valid('client', 'freelancer').optional()
      .messages({
        'any.only': 'Role must be either client or freelancer',
      }),
    page: Joi.number().integer().min(1).default(1)
      .messages({
        'number.min': 'Page must be at least 1',
      }),
    limit: Joi.number().integer().min(1).max(100).default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
      }),
    sortBy: Joi.string().default('createdAt')
      .valid('createdAt', 'updatedAt', 'totalAmount', 'status')
      .messages({
        'any.only': 'Invalid sortBy field',
      }),
    order: Joi.string().valid('asc', 'desc').default('desc')
      .messages({
        'any.only': 'Order must be either asc or desc',
      }),
  }),
};

// Get contract by ID
export const getContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
        'any.required': 'Contract ID is required',
      }),
  }),
};

// Cancel contract
export const cancelContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
  }),
  body: Joi.object({
    reason: Joi.string().required().trim().min(10).max(500)
      .messages({
        'string.min': 'Cancellation reason must be at least 10 characters',
        'string.max': 'Cancellation reason cannot exceed 500 characters',
        'any.required': 'Cancellation reason is required',
      }),
  }),
};

// Accept/Decline contract
export const respondToContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
  }),
  body: Joi.object({
    action: Joi.string().valid('accept', 'decline').required()
      .messages({
        'any.only': 'Action must be either accept or decline',
        'any.required': 'Action is required',
      }),
    reason: Joi.string().optional().trim().min(10).max(500)
      .messages({
        'string.min': 'Reason must be at least 10 characters',
        'string.max': 'Reason cannot exceed 500 characters',
      }),
  }),
};

// Fund milestone escrow
export const fundMilestoneEscrow = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
    milestoneId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid milestone ID format',
        'string.length': 'Invalid milestone ID length',
      }),
  }),
  body: Joi.object({
    paymentMethod: Joi.string()
      .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
      .required()
      .messages({
        'any.only': 'Invalid payment method',
        'any.required': 'Payment method is required',
      }),
    customerData: Joi.object({
      email: Joi.string().email().optional(),
      name: Joi.string().optional(),
      phone: Joi.string().optional(),
    }).optional(),
  }),
};

// Approve milestone
export const approveMilestone = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid contract ID format',
        'string.length': 'Invalid contract ID length',
      }),
    milestoneId: Joi.string().required().hex().length(24)
      .messages({
        'string.hex': 'Invalid milestone ID format',
        'string.length': 'Invalid milestone ID length',
      }),
  }),
  body: Joi.object({}).optional(),
};