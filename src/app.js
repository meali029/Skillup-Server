import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import MongoStore from "connect-mongo";
const baseDir = process.cwd();

// ESM-safe __filename and __dirname resolution (compatible with CommonJS and ESM)
// We avoid direct `import.meta` usage at parse time by using a Function wrapper so
// Jest or CommonJS environments won't error on `import.meta` syntax.
let __filename = baseDir;
let __dirname = baseDir;
try {
  const getMetaUrl = new Function('try { return import.meta.url } catch (e) { return null }');
  const metaUrl = getMetaUrl();
  if (metaUrl) {
    __filename = fileURLToPath(metaUrl);
    __dirname = dirname(__filename);
  }
} catch (err) {
  __filename = baseDir;
  __dirname = baseDir;
}

dotenv.config({ path: join(baseDir, '.env') });

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import session from "express-session";
import passport, { initializePassport } from "./config/passport.js";
import createAuthRoutes from "./modules/auth/auth.routes.js";
import jobRoutes from "./modules/jobs/job.routes.js";
import proposalRoutes from "./modules/proposals/proposal.routes.js";
import createProfileRoutes from "./modules/profile/profile.routes.js";
import contractRoutes from "./modules/contracts/contract.routes.js";
import messageRoutes from "./modules/messages/message.routes.js";
import userManagementRoutes from "./modules/admin/users/user-management.routes.js";
import jobCheckerRoutes from "./modules/admin/jobs/job-checker.routes.js";
import analyticsRoutes from "./modules/admin/analytics/analytics.routes.js";
import auditLogRoutes from "./modules/admin/audit-logs/audit-logs.routes.js";
import permissionsRoutes from "./modules/admin/permissions/permissions.routes.js";
import adminSettingsRoutes from "./modules/admin/admin.settings.routes.js";
import healthRoutes from "./modules/admin/health/health.routes.js";
import envVarsRoutes from "./modules/admin/env-vars/envVars.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import cnicRoutes from "./modules/cnic/cnic.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import disputeRoutes from "./modules/disputes/dispute.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import paymentManagementRoutes from "./modules/admin/payments/payment-management.routes.js";
import { errorHandler, createAppError } from "./core/errors/index.js";
import { AppError } from "./core/errors/index.js";
import { authenticate, authorizeAdmin } from "./core/middlewares/index.js";

initializePassport();

const authRoutes = createAuthRoutes();
const profileRoutes = createProfileRoutes();

const app = express();

app.use("/uploads", express.static(join(__dirname, "../uploads")));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

const sessionOptions = {
  secret: process.env.SESSION_SECRET || "your-super-secret-session-key-change-in-production-min-32-chars",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
};

// Avoid connecting to MongoDB for session store when running tests
if (process.env.NODE_ENV !== 'test') {
  sessionOptions.store = MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    touchAfter: 24 * 3600,
    crypto: {
      secret: process.env.SESSION_SECRET || "your-super-secret-session-key-change-in-production-min-32-chars",
    },
  });
}

app.use(session(sessionOptions));

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
import { getDatabaseHealth, isDatabaseConnected } from "./core/health.js";

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
    const db = await getDatabaseHealth();
    healthcheck.services.database = db;
    if (db.status !== 'healthy') {
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
    const dbConnected = await isDatabaseConnected();
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
app.use("/api/cnic", cnicRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/payments", paymentRoutes);

// Global admin protection - all /api/admin/* routes require admin role AND adminRole
app.use("/api/admin/*", authenticate, authorizeAdmin);

app.use("/api/admin/users", userManagementRoutes);
app.use("/api/admin/jobs", jobCheckerRoutes);
app.use("/api/admin/analytics", analyticsRoutes);
app.use("/api/admin/audit-logs", auditLogRoutes);
app.use("/api/admin/permissions", permissionsRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/health", healthRoutes);
app.use("/api/admin/env-vars", envVarsRoutes);
app.use("/api/admin/payments", paymentManagementRoutes);

app.all("*", (req, res, next) => {
  next(createAppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

export default app;

