const createAppError = (message, statusCode = 500, isOperational = true) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = isOperational;
  error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  
  Error.captureStackTrace(error, createAppError);
  
  return error;
};

export default createAppError;
