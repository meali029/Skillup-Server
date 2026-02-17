import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ensure proper dotenv loading for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

const result = dotenv.config({ path: envPath });

import { createServer } from 'http';
import app from "./app.js";
import connectDB from "./config/db.js";
// Import all models to register them with Mongoose
import "./models/index.js";
import { verifyEmailConfig } from "./core/utils/emailService.js";
import { initializeSocketServer } from "./sockets/index.js";
import { initializeEnvLoader } from "./core/utils/envLoader.js";

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all network interfaces (required for Railway/Docker)

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketServer(httpServer);

// Initialize database connection and start server
connectDB()
  .then(async () => {
    try {
      await initializeEnvLoader();
    } catch (error) {
      console.error('[Server] Error initializing env loader:', error);
      // Continue anyway - will use .env file
    }

    // Verify email configuration on startup
    verifyEmailConfig();

    // Start the HTTP server AFTER database is connected
    httpServer.listen(PORT, HOST, () => {
      console.log(`✅ Server is running on http://${HOST}:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 Socket.io server ready`);
    });
  })
  .catch((error) => {
    console.error('❌ [Server] Database connection failed:', error);
    console.error('❌ [Server] Server startup aborted');
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ [Server] Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Server] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
