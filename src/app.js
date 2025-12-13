import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import MongoStore from "connect-mongo";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import passport, { initializePassport } from "./config/passport.js";
import createAuthRoutes from "./modules/auth/auth.routes.js";
import jobRoutes from "./modules/jobs/job.routes.js";
import proposalRoutes from "./modules/proposals/proposal.routes.js";
import createProfileRoutes from "./modules/profile/profile.routes.js";
import userManagementRoutes from "./modules/admin/users/user-management.routes.js";
import { errorHandler } from "./core/errors/index.js";
import { AppError } from "./core/errors/index.js";

initializePassport();

const authRoutes = createAuthRoutes();
const profileRoutes = createProfileRoutes();

const app = express();

app.use("/uploads", express.static(join(__dirname, "../uploads")));

app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "your-super-secret-session-key-change-in-production-min-32-chars",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600,
      crypto: {
        secret:
          process.env.SESSION_SECRET ||
          "your-super-secret-session-key-change-in-production-min-32-chars",
      },
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.get("/api/health", async (req, res) => {
  const healthcheck = {
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: "1.0.0",
    services: {},
  };

  try {
    const mongoose = (await import("mongoose")).default;
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    healthcheck.services.database = {
      status: dbState === 1 ? "healthy" : "unhealthy",
      state: dbStates[dbState],
      name: mongoose.connection.name || "N/A",
      host: mongoose.connection.host || "N/A",
    };
    if (dbState !== 1) {
      healthcheck.success = false;
      healthcheck.status = "degraded";
    }
  } catch (error) {
    healthcheck.success = false;
    healthcheck.status = "unhealthy";
    healthcheck.services.database = {
      status: "unhealthy",
      error: error.message,
    };
  }

  const memoryUsage = process.memoryUsage();
  healthcheck.services.memory = {
    status: "healthy",
    usage: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
    },
  };

  try {
    healthcheck.services.session = {
      status: "healthy",
      store: process.env.NODE_ENV === "production" ? "MongoDB" : "MemoryStore",
    };
  } catch (error) {
    healthcheck.services.session = {
      status: "unhealthy",
      error: error.message,
    };
  }

  const statusCode =
    healthcheck.status === "healthy"
      ? 200
      : healthcheck.status === "degraded"
      ? 207
      : 503;
  res.status(statusCode).json(healthcheck);
});

app.get("/api/health/ready", async (req, res) => {
  try {
    const mongoose = (await import("mongoose")).default;
    const dbConnected = mongoose.connection.readyState === 1;
    if (!dbConnected) {
      return res.status(503).json({
        success: false,
        ready: false,
        message: "Database not connected",
        timestamp: new Date().toISOString(),
      });
    }
    res.status(200).json({
      success: true,
      ready: true,
      message: "Service is ready to accept traffic",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      ready: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/api/health/live", (req, res) => {
  res.status(200).json({
    success: true,
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.get("/api", (req, res) => {
  res.json({
    success: true,
    name: "SkillUp API",
    version: "1.0.0",
    description:
      "Freelance platform connecting clients with skilled professionals",
    environment: process.env.NODE_ENV,
    endpoints: {
      health: {
        basic: "/health",
        detailed: "/api/health",
        readiness: "/api/health/ready",
        liveness: "/api/health/live",
      },
      auth: "/api/auth",
      jobs: "/api/jobs",
      proposals: "/api/proposals",
    },
    documentation: "https://docs.skillup.com",
    support: "support@skillup.com",
  });
});
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SkillUp API Server is running",
    version: "1.0.0",
    status: "operational",
    documentation: "/api",
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin/users", userManagementRoutes);

app.all("*", (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

export default app;

