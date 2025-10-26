// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file synchronously before any other imports
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Now import other modules after env vars are loaded
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import passport, { initializePassport } from "./config/passport.js";
import createAuthRoutes from "./modules/auth/auth.routes.js";
import jobRoutes from "./modules/jobs/job.routes.js";
import proposalRoutes from "./modules/proposals/proposal.routes.js";
import { errorHandler } from "./core/errors/index.js";
import { AppError } from "./core/errors/index.js";

// Initialize passport with loaded environment variables
initializePassport();

// Create auth routes after environment variables are loaded
const authRoutes = createAuthRoutes();

const app = express();

// Body parser middleware
app.use(express.json());
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production-min-32-chars',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// CORS middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true
}));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/proposals", proposalRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ 
  success: true, 
  message: "Server is running",
  timestamp: new Date().toISOString()
}));

// 404 handler - must be after all routes
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Global error handling middleware - must be last
app.use(errorHandler);

export default app;
