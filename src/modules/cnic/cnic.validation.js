import Joi from 'joi';

// Validation schema for CNIC approval
const approveCNICSchema = Joi.object({
  number: Joi.string()
    .pattern(/^\d{5}-\d{7}-\d{1}$/)
    .required()
    .messages({
      'string.pattern.base': 'CNIC must be in format XXXXX-XXXXXXX-X',
      'any.required': 'CNIC number is required',
    }),
  fullName: Joi.string().min(3).max(100).required().messages({
    'string.min': 'Full name must be at least 3 characters',
    'string.max': 'Full name cannot exceed 100 characters',
    'any.required': 'Full name is required',
  }),
  dateOfBirth: Joi.date().max('now').required().messages({
    'date.max': 'Date of birth cannot be in the future',
    'any.required': 'Date of birth is required',
  }),
  issueDate: Joi.date().max('now').required().messages({
    'date.max': 'Issue date cannot be in the future',
    'any.required': 'Issue date is required',
  }),
  expiryDate: Joi.date().min('now').required().messages({
    'date.min': 'CNIC has expired',
    'any.required': 'Expiry date is required',
  }),
});

// Validation schema for rejection/reupload
const reasonSchema = Joi.object({
  reason: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Reason must be at least 10 characters',
    'string.max': 'Reason cannot exceed 500 characters',
    'any.required': 'Reason is required',
  }),
});

export const validateApproveCNIC = (req, res, next) => {
  const { error, value } = approveCNICSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
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

export const validateReason = (req, res, next) => {
  const { error, value } = reasonSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
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
