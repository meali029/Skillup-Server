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

// Initialize environment loader after DB connection
connectDB().then(async () => {
  try {
    await initializeEnvLoader();
  } catch (error) {
    console.error('[Server] Error initializing env loader:', error);
    // Continue anyway - will use .env file
  }
  
  // Verify email configuration on startup
  verifyEmailConfig();
}).catch((error) => {
  console.error('[Server] Database connection failed:', error);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketServer(httpServer);

httpServer.listen(PORT, ()=> {
  console.log(`Server listening on ${PORT}`);
  console.log(`Socket.io server ready`);
});
