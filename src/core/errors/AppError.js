class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.errors = errors; // Store validation errors array

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// Factory for backward compatibility with existing code that calls AppError(...)
export function createAppError(message, statusCode = 500, isOperational = true, errors = null) {
  return new AppError(message, statusCode, isOperational, errors);
}

export default createAppError;
export { AppError };
