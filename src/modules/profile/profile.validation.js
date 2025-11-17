import Joi from "joi";

export const updateProfileSchema = Joi.object({
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
  
  website: Joi.string()
    .trim()
    .uri()
    .optional()
    .allow("")
    .messages({
      "string.uri": "Please provide a valid website URL"
    }),
  
  // Freelancer fields
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
  
  languages: Joi.array()
    .items(Joi.string().trim().min(2).max(50))
    .max(10)
    .optional()
    .messages({
      "array.max": "You can add up to 10 languages",
      "string.min": "Language name must be at least 2 characters",
      "string.max": "Language name must not exceed 50 characters"
    }),
  
  availability: Joi.string()
    .valid("available", "busy", "not-available")
    .optional()
    .messages({
      "any.only": "Availability must be 'available', 'busy', or 'not-available'"
    }),
  
  // Client fields
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

export const portfolioItemSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .required()
    .messages({
      "string.empty": "Portfolio title is required",
      "string.min": "Portfolio title must be at least 2 characters long",
      "string.max": "Portfolio title must not exceed 200 characters",
      "any.required": "Portfolio title is required"
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
});

export const validateProfileUpdate = (req, res, next) => {
  const { error, value } = updateProfileSchema.validate(req.body, {
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

export const validatePortfolioItem = (req, res, next) => {
  const { error, value } = portfolioItemSchema.validate(req.body, {
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
