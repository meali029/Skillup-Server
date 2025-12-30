import createAppError from './AppError.js';

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = createAppError(message, 404);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = createAppError(message, 400);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = createAppError(message, 400);
  }

  if (err.name === 'JsonWebTokenError') {
    error = createAppError('Invalid token. Please log in again', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = createAppError('Your token has expired. Please log in again', 401);
  }

  // Handle validation errors from Joi (AppError with errors array)
  if (err.isOperational && err.errors && Array.isArray(err.errors)) {
    const validationMessages = err.errors.map(e => e.message || `${e.field}: ${e.message}`).join(', ');
    return res.status(error.statusCode || 400).json({
      success: false,
      status: 'fail',
      message: validationMessages || error.message || 'Validation failed',
      errors: err.errors,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  res.status(error.statusCode || 500).json({
    success: false,
    status: error.status || 'error',
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export default errorHandler;
