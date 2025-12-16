import Joi from 'joi';

// Create contract from proposal
export const createFromProposal = {
  body: Joi.object({
    proposalId: Joi.string().required().hex().length(24),
    terms: Joi.string().optional(),
    deadline: Joi.date().optional().iso(),
    milestones: Joi.array()
      .items(
        Joi.object({
          title: Joi.string().required().trim(),
          description: Joi.string().optional(),
          amount: Joi.number().required().min(0),
          dueDate: Joi.date().optional().iso(),
        })
      )
      .optional(),
  }),
};

// Update contract
export const updateContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    terms: Joi.string().optional(),
    deadline: Joi.date().optional().iso(),
    status: Joi.string()
      .valid('pending', 'active', 'completed', 'cancelled', 'disputed', 'terminated')
      .optional(),
  }).min(1),
};

// Add milestone
export const addMilestone = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    title: Joi.string().required().trim(),
    description: Joi.string().optional(),
    amount: Joi.number().required().min(0),
    dueDate: Joi.date().optional().iso(),
  }),
};

// Update milestone
export const updateMilestone = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
    milestoneId: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    title: Joi.string().optional().trim(),
    description: Joi.string().optional(),
    amount: Joi.number().optional().min(0),
    dueDate: Joi.date().optional().iso(),
    status: Joi.string()
      .valid('pending', 'in_progress', 'completed', 'disputed')
      .optional(),
    notes: Joi.string().optional(),
  }).min(1),
};

// Query contracts
export const queryContracts = {
  query: Joi.object({
    status: Joi.string()
      .valid('pending', 'active', 'completed', 'cancelled', 'disputed', 'terminated')
      .optional(),
    role: Joi.string().valid('client', 'freelancer').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

// Get contract by ID
export const getContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
};

// Cancel contract
export const cancelContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    reason: Joi.string().required().trim().min(10),
  }),
};

// Accept/Decline contract
export const respondToContract = {
  params: Joi.object({
    id: Joi.string().required().hex().length(24),
  }),
  body: Joi.object({
    action: Joi.string().valid('accept', 'decline').required(),
    reason: Joi.string().optional().trim(),
  }),
};
