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

// Initialize passport with loaded environment variables
initializePassport();

// Create auth routes after environment variables are loaded
const authRoutes = createAuthRoutes();

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true
}));

app.use("/api/auth", authRoutes);

app.get("/api/health", (req, res) => res.json({status: "ok"}));

export default app;