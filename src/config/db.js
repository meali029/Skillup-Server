import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is not set. Please set MONGO_URI in your environment variables.');
    throw new Error('MONGO_URI not provided');
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      // Short server selection timeout to fail fast in CI/containers
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('[DB] Connection error:', err.message || err);
    // Keep existing behavior of failing startup so errors are visible in logs
    process.exit(1);
  }
};

export default connectDB;
