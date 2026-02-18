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

// ===== PRODUCTION STARTUP DIAGNOSTICS =====
const logEnvStatus = () => {
  const env = process.env;
  const isSet = (key) => !!env[key] && env[key] !== 'null' && env[key] !== 'undefined';
  const mask = (key) => isSet(key) ? `✅ SET (${env[key].length} chars)` : '❌ MISSING';

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     SKILLUP SERVER DIAGNOSTICS       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║ NODE_ENV:         ${env.NODE_ENV || 'not set'}`);
  console.log(`║ PORT:             ${env.PORT || '5000 (default)}'}`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║ DATABASE                             ║');
  console.log(`║   MONGO_URI:      ${mask('MONGO_URI')}`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║ AUTH / SECURITY                      ║');
  console.log(`║   JWT_SECRET:     ${mask('JWT_SECRET')}`);
  console.log(`║   SESSION_SECRET: ${mask('SESSION_SECRET')}`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║ GOOGLE OAUTH                         ║');
  console.log(`║   CLIENT_ID:      ${mask('GOOGLE_CLIENT_ID')}`);
  console.log(`║   CLIENT_SECRET:  ${mask('GOOGLE_CLIENT_SECRET')}`);
  console.log(`║   CALLBACK_URL:   ${isSet('GOOGLE_CALLBACK_URL') ? '✅ ' + env.GOOGLE_CALLBACK_URL : '❌ MISSING'}`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║ EMAIL                                ║');
  console.log(`║   EMAIL_USER:     ${mask('EMAIL_USER')}`);
  console.log(`║   EMAIL_PASSWORD: ${mask('EMAIL_PASSWORD')}`);
  console.log(`║   EMAIL_HOST:     ${env.EMAIL_HOST || 'smtp.gmail.com (default)'}`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║ URLS                                 ║');
  console.log(`║   CLIENT_URL:     ${env.CLIENT_URL || '❌ MISSING'}`);
  console.log(`║   FRONTEND_URL:   ${env.FRONTEND_URL || '(not set)'}`);
  console.log(`║   API_URL:        ${env.API_URL || '❌ MISSING'}`);
  console.log('╚══════════════════════════════════════╝\n');
};

logEnvStatus();

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
