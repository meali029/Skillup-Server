const asyncHandler = (fn) => (req, res, next) => {
  // Return the promise so callers can await the middleware (important for tests)
  return Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
