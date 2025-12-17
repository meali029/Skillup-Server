import Joi from "joi";
import { validateCNIC } from "../../core/utils/cnicValidation.js";

export const registerSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name must not exceed 100 characters",
      "any.required": "Name is required"
    }),
  
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    }),
  
  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 6 characters long",
      "string.max": "Password must not exceed 128 characters",
      "any.required": "Password is required"
    }),
  
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .optional()
    .messages({
      "any.only": "Passwords do not match"
    }),
  
  role: Joi.string()
    .valid("freelancer", "client")
    .optional()
    .messages({
      "any.only": "Role must be either 'freelancer' or 'client'"
    }),
  
  // Basic profile fields (optional during registration)
  bio: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow("")
    .messages({
      "string.max": "Bio must not exceed 500 characters"
    }),
  
  location: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow("")
    .messages({
      "string.max": "Location must not exceed 200 characters"
    }),
  
  phone: Joi.string()
    .trim()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .optional()
    .allow("")
    .messages({
      "string.pattern.base": "Please provide a valid phone number"
    }),
  
  // Freelancer-specific fields (optional during registration)
  skills: Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .min(0)
    .max(20)
    .optional()
    .messages({
      "array.max": "You can add up to 20 skills",
      "string.min": "Skill name must not be empty",
      "string.max": "Skill name must not exceed 50 characters"
    }),
  
  hourlyRate: Joi.number()
    .positive()
    .min(5)
    .max(10000)
    .optional()
    .messages({
      "number.positive": "Hourly rate must be a positive number",
      "number.min": "Hourly rate must be at least $5",
      "number.max": "Hourly rate must not exceed $10,000"
    }),
  
  experience: Joi.string()
    .valid("beginner", "intermediate", "expert")
    .optional()
    .messages({
      "any.only": "Experience level must be 'beginner', 'intermediate', or 'expert'"
    }),
  
  // Client-specific fields (optional during registration)
  companyName: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .messages({
      "string.min": "Company name must be at least 2 characters long",
      "string.max": "Company name must not exceed 200 characters"
    }),
  
  companySize: Joi.string()
    .valid("1-10", "11-50", "51-200", "201-500", "500+")
    .optional()
    .messages({
      "any.only": "Company size must be one of: 1-10, 11-50, 51-200, 201-500, 500+"
    }),
  
  industry: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .messages({
      "string.min": "Industry must be at least 2 characters long",
      "string.max": "Industry must not exceed 100 characters"
    })
});

export const loginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    }),
  
  password: Joi.string()
    .required()
    .messages({
      "string.empty": "Password is required",
      "any.required": "Password is required"
    })
});

export const updateFreelancerProfileSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .messages({
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name must not exceed 100 characters"
    }),
  
  bio: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow("")
    .messages({
      "string.max": "Bio must not exceed 500 characters"
    }),
  
  location: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow("")
    .messages({
      "string.max": "Location must not exceed 200 characters"
    }),
  
  phone: Joi.string()
    .trim()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .optional()
    .allow("")
    .messages({
      "string.pattern.base": "Please provide a valid phone number"
    }),
  
  skills: Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .min(1)
    .max(20)
    .optional()
    .messages({
      "array.min": "Please add at least one skill",
      "array.max": "You can add up to 20 skills",
      "string.min": "Skill name must not be empty",
      "string.max": "Skill name must not exceed 50 characters"
    }),
  
  hourlyRate: Joi.number()
    .positive()
    .min(5)
    .max(10000)
    .optional()
    .messages({
      "number.positive": "Hourly rate must be a positive number",
      "number.min": "Hourly rate must be at least $5",
      "number.max": "Hourly rate must not exceed $10,000"
    }),
  
  experience: Joi.string()
    .valid("beginner", "intermediate", "expert")
    .optional()
    .messages({
      "any.only": "Experience level must be 'beginner', 'intermediate', or 'expert'"
    }),
  
  portfolio: Joi.array()
    .items(
      Joi.object({
        title: Joi.string()
          .trim()
          .min(2)
          .max(200)
          .required()
          .messages({
            "string.empty": "Portfolio title is required",
            "string.min": "Portfolio title must be at least 2 characters long",
            "string.max": "Portfolio title must not exceed 200 characters"
          }),
        
        description: Joi.string()
          .trim()
          .max(1000)
          .optional()
          .allow("")
          .messages({
            "string.max": "Portfolio description must not exceed 1000 characters"
          }),
        
        url: Joi.string()
          .trim()
          .uri()
          .optional()
          .allow("")
          .messages({
            "string.uri": "Please provide a valid URL"
          }),
        
        image: Joi.string()
          .trim()
          .uri()
          .optional()
          .allow("")
          .messages({
            "string.uri": "Please provide a valid image URL"
          })
      })
    )
    .max(10)
    .optional()
    .messages({
      "array.max": "You can add up to 10 portfolio items"
    }),
  
  avatar: Joi.string()
    .trim()
    .uri()
    .optional()
    .allow("")
    .messages({
      "string.uri": "Please provide a valid avatar URL"
    })
});

export const updateClientProfileSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .messages({
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name must not exceed 100 characters"
    }),
  
  bio: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow("")
    .messages({
      "string.max": "Bio must not exceed 500 characters"
    }),
  
  location: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow("")
    .messages({
      "string.max": "Location must not exceed 200 characters"
    }),
  
  phone: Joi.string()
    .trim()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .optional()
    .allow("")
    .messages({
      "string.pattern.base": "Please provide a valid phone number"
    }),
  
  companyName: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .messages({
      "string.min": "Company name must be at least 2 characters long",
      "string.max": "Company name must not exceed 200 characters"
    }),
  
  companySize: Joi.string()
    .valid("1-10", "11-50", "51-200", "201-500", "500+")
    .optional()
    .messages({
      "any.only": "Company size must be one of: 1-10, 11-50, 51-200, 201-500, 500+"
    }),
  
  industry: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .messages({
      "string.min": "Industry must be at least 2 characters long",
      "string.max": "Industry must not exceed 100 characters"
    }),
  
  avatar: Joi.string()
    .trim()
    .uri()
    .optional()
    .allow("")
    .messages({
      "string.uri": "Please provide a valid avatar URL"
    })
});

export const selectRoleSchema = Joi.object({
  role: Joi.string()
    .valid("freelancer", "client")
    .required()
    .messages({
      "string.empty": "Role is required",
      "any.only": "Role must be either 'freelancer' or 'client'",
      "any.required": "Role is required"
    })
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      "string.empty": "Current password is required",
      "any.required": "Current password is required"
    }),
  
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      "string.empty": "New password is required",
      "string.min": "New password must be at least 8 characters long",
      "string.max": "New password must not exceed 128 characters",
      "string.pattern.base": "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "New password is required"
    }),
  
  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your new password"
    })
});


export const emailSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    })
});

export const requestPasswordResetSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    })
});

export const verifyOTPSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    }),
  
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.empty": "OTP is required",
      "string.length": "OTP must be exactly 6 digits",
      "string.pattern.base": "OTP must contain only numbers",
      "any.required": "OTP is required"
    })
});

export const resetPasswordSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required"
    }),
  
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.empty": "OTP is required",
      "string.length": "OTP must be exactly 6 digits",
      "string.pattern.base": "OTP must contain only numbers",
      "any.required": "OTP is required"
    }),
  
  newPassword: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      "string.empty": "New password is required",
      "string.min": "Password must be at least 6 characters long",
      "string.max": "Password must not exceed 128 characters",
      "any.required": "New password is required"
    }),
  
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your new password"
    })
});

export const validateRegister = (req, res, next) => {
  const { error, value } = registerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateFreelancerProfile = (req, res, next) => {
  const { error, value } = updateFreelancerProfileSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateClientProfile = (req, res, next) => {
  const { error, value } = updateClientProfileSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateRoleSelection = (req, res, next) => {
  const { error, value } = selectRoleSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateChangePassword = (req, res, next) => {
  const { error, value } = changePasswordSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateEmail = (req, res, next) => {
  const { error, value } = emailSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateRequestPasswordReset = (req, res, next) => {
  const { error, value } = requestPasswordResetSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateVerifyOTP = (req, res, next) => {
  const { error, value } = verifyOTPSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

export const validateResetPassword = (req, res, next) => {
  const { error, value } = resetPasswordSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

// CNIC Validation Schema
export const submitCNICSchema = Joi.object({
  cnicNumber: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      const validation = validateCNIC(value);
      if (!validation.valid) {
        return helpers.error('string.custom', { message: validation.error });
      }
      return validation.normalized;
    })
    .messages({
      "string.empty": "CNIC number is required",
      "any.required": "CNIC number is required",
      "string.custom": "Invalid CNIC format. Expected format: XXXXX-XXXXXXX-X (e.g., 12345-1234567-1)"
    })
});

export const validateSubmitCNIC = (req, res, next) => {
  const { error, value } = submitCNICSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};

// Admin CNIC Verification Schema
export const verifyCNICSchema = Joi.object({
  status: Joi.string()
    .valid("verified", "rejected")
    .required()
    .messages({
      "any.only": "Status must be either 'verified' or 'rejected'",
      "any.required": "Status is required"
    }),
  
  rejectionReason: Joi.string()
    .trim()
    .max(500)
    .when('status', {
      is: 'rejected',
      then: Joi.required(),
      otherwise: Joi.optional().allow("")
    })
    .messages({
      "string.max": "Rejection reason must not exceed 500 characters",
      "any.required": "Rejection reason is required when status is 'rejected'"
    })
});

export const validateVerifyCNIC = (req, res, next) => {
  const { error, value } = verifyCNICSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors
    });
  }

  req.validatedData = value;
  next();
};
