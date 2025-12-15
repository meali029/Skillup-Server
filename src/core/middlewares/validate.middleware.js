import { AppError } from "../errors/index.js";

/**
 * Validation Middleware Factory
 * Validates request data against Joi schema
 * @param {Object} schema - Joi validation schema
 * @param {String} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      throw AppError('Validation failed', 400, true);
    }

    // Attach validated data to request
    req.validatedData = value;
    next();
  };
};

export default validate;
