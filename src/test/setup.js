import mongoose from 'mongoose';

let mongoServer;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '7d';
process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-only';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
// Shorten Gemini timeout in tests so any provider timeouts occur quickly and don't leave long-running timers
process.env.GEMINI_TIMEOUT = process.env.GEMINI_TIMEOUT || '100';
// Increase default timeout for long-running setup operations (apply before hooks)
try {
  jest.setTimeout(30000);
} catch (err) {
  // jest may not be available in some environments; ignore
}

// Ignore AI provider timeouts and other expected async test-time errors so they don't
// cause the test runner to exit with a non-zero code. We keep this narrow to AITimeoutError
// and rate-limit like errors which are intentionally triggered in tests.
process.on('unhandledRejection', (err) => {
  try {
    const msg = err && err.message ? err.message : '';
    const status = err && err.statusCode ? err.statusCode : null;
    if (status === 504 || msg.includes('AI request timed out') || msg.includes('AI rate limit exceeded')) {
      // swallow expected AI errors in tests
      return;
    }
  } catch (e) {
    // ignore
  }
  // rethrow unexpected errors to fail tests
  throw err;
});

beforeAll(async () => {
  // Try to use mongodb-memory-server if available, otherwise fall back to provided MONGO_URI
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  } catch (err) {
    // mongodb-memory-server not installed or failed — attempt to connect to real MongoDB instead
    console.warn('[test.setup] mongodb-memory-server unavailable, attempting to connect to', process.env.MONGO_URI);
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 5000,
      });
    } catch (connectErr) {
      // If real MongoDB isn't available, continue without DB; tests that require DB should handle this.
      console.warn('[test.setup] Failed to connect to real MongoDB, proceeding without DB for tests', connectErr.message);
    }
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  } catch (err) {
    // ignore
  }

  if (mongoServer) {
    try {
      await mongoServer.stop();
    } catch (err) {
      // ignore
    }
  }
});
