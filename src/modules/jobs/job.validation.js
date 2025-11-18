import Joi from 'joi';

// Create Job Validation
export const createJobSchema = Joi.object({
  title: Joi.string()
    .min(5)
    .max(100)
    .required()
    .trim()
    .messages({
      'string.min': 'Job title must be at least 5 characters',
      'string.max': 'Job title cannot exceed 100 characters',
      'any.required': 'Job title is required',
    }),
  
  description: Joi.string()
    .min(50)
    .max(5000)
    .required()
    .trim()
    .messages({
      'string.min': 'Description must be at least 50 characters',
      'string.max': 'Description cannot exceed 5000 characters',
      'any.required': 'Job description is required',
    }),
  
  category: Joi.string()
    .valid(
      'web-development',
      'mobile-development',
      'design',
      'writing',
      'marketing',
      'video-editing',
      'data-entry',
      'customer-service',
      'virtual-assistant',
      'other'
    )
    .required()
    .messages({
      'any.only': 'Invalid job category',
      'any.required': 'Job category is required',
    }),
  
  skills: Joi.array()
    .items(Joi.string().trim().lowercase())
    .min(1)
    .max(10)
    .messages({
      'array.min': 'At least one skill is required',
      'array.max': 'Maximum 10 skills allowed',
    }),
  
  budgetType: Joi.string()
    .valid('fixed', 'hourly')
    .required()
    .messages({
      'any.only': 'Budget type must be either fixed or hourly',
      'any.required': 'Budget type is required',
    }),
  
  budgetAmount: Joi.when('budgetType', {
    is: 'fixed',
    then: Joi.number()
      .min(5)
      .max(1000000)
      .required()
      .messages({
        'number.min': 'Budget must be at least $5',
        'number.max': 'Budget cannot exceed $1,000,000',
        'any.required': 'Budget amount is required for fixed budget',
      }),
    otherwise: Joi.number().optional(),
  }),
  
  hourlyRate: Joi.when('budgetType', {
    is: 'hourly',
    then: Joi.object({
      min: Joi.number()
        .min(5)
        .max(500)
        .required()
        .messages({
          'number.min': 'Minimum hourly rate must be at least $5',
          'number.max': 'Minimum hourly rate cannot exceed $500',
          'any.required': 'Minimum hourly rate is required',
        }),
      max: Joi.number()
        .min(Joi.ref('min'))
        .max(500)
        .required()
        .messages({
          'number.min': 'Maximum hourly rate must be greater than minimum',
          'number.max': 'Maximum hourly rate cannot exceed $500',
          'any.required': 'Maximum hourly rate is required',
        }),
    }).required(),
    otherwise: Joi.object().optional(),
  }),
  
  duration: Joi.string()
    .valid(
      'less-than-week',
      '1-2-weeks',
      '2-4-weeks',
      '1-3-months',
      '3-6-months',
      'more-than-6-months'
    )
    .optional(),
  
  experienceLevel: Joi.string()
    .valid('entry', 'intermediate', 'expert')
    .default('intermediate'),
  
  projectSize: Joi.string()
    .valid('small', 'medium', 'large')
    .default('medium'),
  
  locationType: Joi.string()
    .valid('remote', 'onsite', 'hybrid')
    .default('remote'),
  
  location: Joi.object({
    country: Joi.string().optional().allow(''),
    city: Joi.string().optional().allow(''),
    timezone: Joi.string().optional().allow(''),
  }).optional(),
  
  applicationDeadline: Joi.date()
    .greater('now')
    .optional()
    .messages({
      'date.greater': 'Application deadline must be in the future',
    }),
  
  startDate: Joi.date()
    .greater('now')
    .optional()
    .messages({
      'date.greater': 'Start date must be in the future',
    }),
  
  maxProposals: Joi.number()
    .min(1)
    .max(100)
    .default(50),
  
  isPublic: Joi.boolean().default(true),
});

// Update Job Validation (all fields optional)
export const updateJobSchema = Joi.object({
  title: Joi.string().min(5).max(100).trim().optional(),
  description: Joi.string().min(50).max(5000).trim().optional(),
  category: Joi.string()
    .valid(
      'web-development',
      'mobile-development',
      'design',
      'writing',
      'marketing',
      'video-editing',
      'data-entry',
      'customer-service',
      'virtual-assistant',
      'other'
    )
    .optional(),
  skills: Joi.array().items(Joi.string().trim().lowercase()).min(1).max(10).optional(),
  budgetType: Joi.string().valid('fixed', 'hourly').optional(),
  budgetAmount: Joi.number().min(5).max(1000000).optional(),
  hourlyRate: Joi.object({
    min: Joi.number().min(5).max(500).required(),
    max: Joi.number().min(Joi.ref('min')).max(500).required(),
  }).optional(),
  duration: Joi.string()
    .valid(
      'less-than-week',
      '1-2-weeks',
      '2-4-weeks',
      '1-3-months',
      '3-6-months',
      'more-than-6-months'
    )
    .optional(),
  experienceLevel: Joi.string().valid('entry', 'intermediate', 'expert').optional(),
  projectSize: Joi.string().valid('small', 'medium', 'large').optional(),
  location: Joi.object({
    type: Joi.string().valid('remote', 'onsite', 'hybrid').optional(),
    country: Joi.string().optional(),
    city: Joi.string().optional(),
    timezone: Joi.string().optional(),
  }).optional(),
  applicationDeadline: Joi.date().greater('now').optional(),
  startDate: Joi.date().greater('now').optional(),
  maxProposals: Joi.number().min(1).max(100).optional(),
  isPublic: Joi.boolean().optional(),
  status: Joi.string()
    .valid('draft', 'open', 'in-progress', 'completed', 'cancelled', 'closed')
    .optional(),
}).min(1);

// Query/Filter Validation
export const jobQuerySchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  sort: Joi.string()
    .valid('createdAt', '-createdAt', 'budgetAmount', '-budgetAmount', 'title', '-title')
    .default('-createdAt'),
  category: Joi.string()
    .valid(
      'web-development',
      'mobile-development',
      'design',
      'writing',
      'marketing',
      'video-editing',
      'data-entry',
      'customer-service',
      'virtual-assistant',
      'other'
    )
    .optional(),
  budgetType: Joi.string().valid('fixed', 'hourly').optional(),
  minBudget: Joi.number().min(0).optional(),
  maxBudget: Joi.number().min(Joi.ref('minBudget')).optional(),
  experienceLevel: Joi.string().valid('entry', 'intermediate', 'expert').optional(),
  locationType: Joi.string().valid('remote', 'onsite', 'hybrid').optional(),
  duration: Joi.string()
    .valid(
      'less-than-1-month',
      '1-3-months',
      '3-6-months',
      '6-months-plus',
      'less-than-week',
      '1-2-weeks',
      '2-4-weeks',
      'more-than-6-months'
    )
    .optional(),
  projectSize: Joi.string().valid('small', 'medium', 'large').optional(),
  skills: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  search: Joi.string().trim().optional(),
  status: Joi.string()
    .valid('draft', 'open', 'in-progress', 'completed', 'cancelled', 'closed')
    .default('open'),
});

// Validation middleware
export const validateCreateJob = (req, res, next) => {
  const { error, value } = createJobSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  req.validatedData = value;
  next();
};

export const validateUpdateJob = (req, res, next) => {
  const { error, value } = updateJobSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  req.validatedData = value;
  next();
};

export const validateJobQuery = (req, res, next) => {
  const { error, value } = jobQuerySchema.validate(req.query, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Invalid query parameters',
      errors,
    });
  }
  
  req.validatedQuery = value;
  next();
};
