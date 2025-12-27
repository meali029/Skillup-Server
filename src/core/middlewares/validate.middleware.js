import { createAppError } from "../errors/index.js";

/**
 * Validation Middleware Factory
 * Validates request data against Joi schema
 * @param {Object} schema - Joi validation schema or object with {body, query, params} properties
 * @param {String} property - Request property to validate ('body', 'query', 'params') - only used if schema is a plain Joi object
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    try {
      // Check if schema has body/query/params properties (multi-property validation)
      if (schema.body || schema.query || schema.params) {
        // Validate each property that exists in the schema
        const errors = [];
        
        if (schema.params) {
          const { error, value } = schema.params.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
          });
          if (error) {
            errors.push(...error.details);
          } else {
            req.params = value;
          }
        }
        
        if (schema.query) {
          const { error, value } = schema.query.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
          });
          if (error) {
            errors.push(...error.details);
          } else {
            req.query = value;
          }
        }
        
        if (schema.body) {
          const { error, value } = schema.body.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
          });
          if (error) {
            errors.push(...error.details);
          } else {
            req.body = value;
          }
        }
        
        if (errors.length > 0) {
          const formattedErrors = errors.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }));
          throw createAppError('Validation failed', 400, true, formattedErrors);
        }
      } else {
        // Plain Joi schema - validate single property
        const { error, value } = schema.validate(req[property], {
          abortEarly: false,
          stripUnknown: true
        });

        if (error) {
          const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }));
          throw createAppError('Validation failed', 400, true, errors);
        }

        // Attach validated data to request
        req[property] = value;
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validate;
