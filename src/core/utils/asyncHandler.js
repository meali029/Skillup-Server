/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 * Usage: asyncHandler(async (req, res, next) => { ... })
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
