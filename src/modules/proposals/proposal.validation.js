import Joi from "joi";

/**
 * Validation schema for submitting a proposal
 */
export const submitProposalSchema = Joi.object({
  jobId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid job ID format",
      "any.required": "Job ID is required",
    }),

  coverLetter: Joi.string()
    .min(100)
    .max(2000)
    .required()
    .trim()
    .messages({
      "string.min": "Cover letter must be at least 100 characters",
      "string.max": "Cover letter cannot exceed 2000 characters",
      "any.required": "Cover letter is required",
    }),

  bidAmount: Joi.number()
    .min(500)
    .max(10000000)
    .required()
    .messages({
      "number.min": "Proposed price must be at least PKR 500",
      "number.max": "Proposed price cannot exceed PKR 10,000,000",
      "any.required": "Proposed price is required",
    }),

  deliveryTime: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .required()
    .messages({
      "number.min": "Delivery time must be at least 1 day",
      "number.max": "Delivery time cannot exceed 365 days",
      "number.integer": "Delivery time must be a whole number",
      "any.required": "Delivery time is required",
    }),

  attachments: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        url: Joi.string().uri().required(),
      })
    )
    .max(5)
    .optional()
    .messages({
      "array.max": "Maximum 5 attachments allowed",
    }),
});

/**
 * Validation schema for updating a proposal
 */
export const updateProposalSchema = Joi.object({
  coverLetter: Joi.string()
    .min(100)
    .max(2000)
    .trim()
    .messages({
      "string.min": "Cover letter must be at least 100 characters",
      "string.max": "Cover letter cannot exceed 2000 characters",
    }),

  bidAmount: Joi.number()
    .min(500)
    .max(10000000)
    .messages({
      "number.min": "Proposed price must be at least PKR 500",
      "number.max": "Proposed price cannot exceed PKR 10,000,000",
    }),

  deliveryTime: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .messages({
      "number.min": "Delivery time must be at least 1 day",
      "number.max": "Delivery time cannot exceed 365 days",
      "number.integer": "Delivery time must be a whole number",
    }),

  attachments: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        url: Joi.string().uri().required(),
      })
    )
    .max(5)
    .messages({
      "array.max": "Maximum 5 attachments allowed",
    }),
}).min(1).messages({
  "object.min": "At least one field must be provided for update",
});

/**
 * Validation schema for proposal ID parameter
 */
export const proposalIdSchema = Joi.object({
  id: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid proposal ID format",
      "any.required": "Proposal ID is required",
    }),
});

/**
 * Validation schema for job ID parameter
 */
export const jobIdSchema = Joi.object({
  jobId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid job ID format",
      "any.required": "Job ID is required",
    }),
});

/**
 * Validation schema for query parameters
 */
export const proposalQuerySchema = Joi.object({
  status: Joi.string()
    .valid("pending", "accepted", "rejected", "withdrawn")
    .optional()
    .messages({
      "any.only": "Invalid status value",
    }),

  page: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(1)
    .messages({
      "number.min": "Page must be at least 1",
      "number.integer": "Page must be a whole number",
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .messages({
      "number.min": "Limit must be at least 1",
      "number.max": "Limit cannot exceed 100",
      "number.integer": "Limit must be a whole number",
    }),

  sortBy: Joi.string()
    .valid("createdAt", "bidAmount", "deliveryTime", "status")
    .optional()
    .default("createdAt")
    .messages({
      "any.only": "Invalid sortBy field",
    }),

  sortOrder: Joi.string()
    .valid("asc", "desc")
    .optional()
    .default("desc")
    .messages({
      "any.only": "Sort order must be either asc or desc",
    }),
});

/**
 * Validation schema for rejecting a proposal
 */
export const rejectProposalSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .allow('')
    .optional()
    .custom((value, helpers) => {
      // If reason is provided and not empty, must be at least 10 chars
      if (value && value.length > 0 && value.length < 10) {
        return helpers.error('string.min', { limit: 10 });
      }
      if (value && value.length > 500) {
        return helpers.error('string.max', { limit: 500 });
      }
      return value;
    })
    .messages({
      "string.min": "Rejection reason must be at least 10 characters if provided",
      "string.max": "Rejection reason cannot exceed 500 characters",
    }),
});

/**
 * Validation middleware for submitting a proposal
 */
export const validateSubmitProposal = (req, res, next) => {
  const { error, value } = submitProposalSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  req.validatedData = value;
  next();
};

/**
 * Validation middleware for updating a proposal
 */
export const validateUpdateProposal = (req, res, next) => {
  const { error, value } = updateProposalSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  req.validatedData = value;
  next();
};

/**
 * Validation middleware for proposal ID parameter
 */
export const validateProposalId = (req, res, next) => {
  const { error } = proposalIdSchema.validate({ id: req.params.id });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid proposal ID",
    });
  }

  next();
};

/**
 * Validation middleware for job ID parameter
 */
export const validateJobId = (req, res, next) => {
  const { error } = jobIdSchema.validate({ jobId: req.params.jobId });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid job ID",
    });
  }

  next();
};

/**
 * Validation middleware for query parameters
 */
export const validateProposalQuery = (req, res, next) => {
  const { error, value } = proposalQuerySchema.validate(req.query, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  req.validatedQuery = value;
  next();
};

/**
 * Validation middleware for rejecting a proposal
 */
export const validateRejectProposal = (req, res, next) => {
  const { error, value } = rejectProposalSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  req.validatedData = value;
  next();
};
