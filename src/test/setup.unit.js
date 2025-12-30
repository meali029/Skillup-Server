// Minimal unit test setup
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-key-for-testing-only';
try { jest.setTimeout(30000); } catch (e) { /* ignore when not running inside Jest env */ }
// Keep the unhandledRejection handler from main setup for expected AI errors
process.on('unhandledRejection', (err) => {
  try {
    const msg = err && err.message ? err.message : '';
    const status = err && err.statusCode ? err.statusCode : null;
    if (status === 504 || msg.includes('AI request timed out') || msg.includes('AI rate limit exceeded')) {
      return;
    }
  } catch (e) {}
  throw err;
});