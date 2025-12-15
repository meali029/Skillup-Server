import Joi from 'joi';

const getJobsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('draft', 'open', 'in-progress', 'in-review', 'completed', 'cancelled', 'closed'),
  category: Joi.string(),
  isFlagged: Joi.boolean(),
  isFeatured: Joi.boolean(),
  search: Joi.string().allow(''),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'title', 'budgetAmount', 'proposalsCount', 'views').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
});

const jobIdParamsSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid job ID format',
    'string.length': 'Invalid job ID format',
  }),
});

const rejectJobBodySchema = Joi.object({
  reason: Joi.string().required().min(10).max(500).messages({
    'any.required': 'Rejection reason is required',
    'string.min': 'Reason must be at least 10 characters',
    'string.max': 'Reason cannot exceed 500 characters',
  }),
});

const flagJobBodySchema = Joi.object({
  reason: Joi.string().required().min(10).max(500).messages({
    'any.required': 'Flag reason is required',
    'string.min': 'Reason must be at least 10 characters',
    'string.max': 'Reason cannot exceed 500 characters',
  }),
  flagType: Joi.string().valid('inappropriate', 'spam', 'misleading', 'duplicate', 'other').required(),
});

export const getJobs = (req, res, next) => {
  const { error, value } = getJobsSchema.validate(req.query, { abortEarly: false });
  
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

export const getJobById = (req, res, next) => {
  const { error, value } = jobIdParamsSchema.validate(req.params, { abortEarly: false });
  
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

export const jobAction = (req, res, next) => {
  const { error, value } = jobIdParamsSchema.validate(req.params, { abortEarly: false });
  
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

export const rejectJob = (req, res, next) => {
  // Validate params
  const paramsValidation = jobIdParamsSchema.validate(req.params, { abortEarly: false });
  if (paramsValidation.error) {
    const errors = paramsValidation.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  // Validate body
  const bodyValidation = rejectJobBodySchema.validate(req.body, { abortEarly: false });
  if (bodyValidation.error) {
    const errors = bodyValidation.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  req.validatedData = { ...paramsValidation.value, ...bodyValidation.value };
  next();
};

export const flagJob = (req, res, next) => {
  // Validate params
  const paramsValidation = jobIdParamsSchema.validate(req.params, { abortEarly: false });
  if (paramsValidation.error) {
    const errors = paramsValidation.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  // Validate body
  const bodyValidation = flagJobBodySchema.validate(req.body, { abortEarly: false });
  if (bodyValidation.error) {
    const errors = bodyValidation.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  
  req.validatedData = { ...paramsValidation.value, ...bodyValidation.value };
  next();
};
