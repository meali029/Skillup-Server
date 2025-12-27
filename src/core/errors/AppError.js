class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// Factory for backward compatibility with existing code that calls AppError(...)
export function createAppError(message, statusCode = 500, isOperational = true) {
  return new AppError(message, statusCode, isOperational);
}

export default createAppError;
export { AppError };
