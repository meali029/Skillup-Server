import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import MongoStore from "connect-mongo";
import { RedisStore } from "connect-redis";
import redisClient, { isRedisConnected } from "./config/redis.js";
const baseDir = process.cwd();
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";


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
import reviewRoutes from "./modules/reviews/review.routes.js";
import paymentManagementRoutes from "./modules/admin/payments/payment-management.routes.js";
import uploadRoutes from "./modules/uploads/upload.routes.js";
import subscriptionRoutes from "./modules/subscriptions/subscription.routes.js";
import { adminRouter as adminSubscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { errorHandler, createAppError } from "./core/errors/index.js";
import { AppError } from "./core/errors/index.js";
import { authenticate, authorizeAdmin } from "./core/middlewares/index.js";

initializePassport();

const authRoutes = createAuthRoutes();
const profileRoutes = createProfileRoutes();

const app = express();

// Trust proxy (required for Railway/Heroku/Render - they run behind a reverse proxy)
// This allows secure cookies and correct IP detection
app.set('trust proxy', 1);

// ===== PRODUCTION ERROR LOGGING MIDDLEWARE =====
// Log all 4xx/5xx responses with useful context
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Capture original end to log after response
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    
    // Only log errors (4xx, 5xx) and slow requests (>5s)
    if (status >= 400 || duration > 5000) {
      const logLevel = status >= 500 ? '❌' : '⚠️';
      console.error(`${logLevel} [${req.method}] ${req.originalUrl} → ${status} (${duration}ms)`);
      
      if (status >= 500) {
        console.error(`   ↳ IP: ${req.ip} | User-Agent: ${req.get('user-agent')?.substring(0, 80)}`);
      }
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
});

app.use("/uploads", express.static(join(__dirname, "../uploads")));

app.use(express.json({ 
  limit: '10mb',
  verify: (req, _res, buf) => {
    // Preserve raw body for webhook signature verification (Safepay)
    if (req.originalUrl && req.originalUrl.includes('/webhook/')) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Validate and prepare session secret (ensure it's never null/undefined)
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'null' || sessionSecret === 'undefined') {
  sessionSecret = "your-super-secret-session-key-change-in-production-min-32-chars";
  console.warn('⚠️  [Session] SESSION_SECRET not properly set, using fallback secret');
}

if (sessionSecret.length < 32) {
  console.warn('⚠️  [Session] SESSION_SECRET should be at least 32 characters for security');
}

const sessionOptions = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Only set secure:true if actually running behind HTTPS (Railway sets this automatically)
    // On localhost, secure cookies will BREAK sessions even if NODE_ENV=production
    secure: process.env.NODE_ENV === "production" && !!(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.HEROKU),
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" && (process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.HEROKU) ? "none" : "lax",
  },
};

// Avoid connecting to MongoDB for session store when running tests
if (process.env.NODE_ENV !== 'test') {
  // Prefer Redis session store, fall back to MongoDB
  if (isRedisConnected()) {
    try {
      sessionOptions.store = new RedisStore({
        client: redisClient,
        prefix: 'sess:',
        ttl: 60 * 60 * 24 * 7, // 7 days (matches cookie maxAge)
      });
      console.info('[Session] Redis session store initialized');
    } catch (err) {
      console.error('[Session] Failed to initialize Redis session store:', err.message);
    }
  }

  // Fall back to MongoDB if Redis store wasn't set
  if (!sessionOptions.store) {
    const mongoUri = process.env.MONGO_URI;
    if (mongoUri) {
      try {
        sessionOptions.store = MongoStore.create({
          mongoUrl: mongoUri,
          touchAfter: 24 * 3600,
          collectionName: 'sessions',
        });
        console.info('[Session] MongoDB session store initialized (Redis unavailable)');
      } catch (err) {
        console.error('[Session] Failed to initialize Mongo session store:', err.message);
        console.warn('[Session] Falling back to in-memory session store.');
      }
    } else {
      console.error('[Session] MONGO_URI is not set — using in-memory session store.');
    }
  }
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
app.use("/api/reviews", reviewRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

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
app.use("/api/admin/subscriptions", adminSubscriptionRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.all("*", (req, res, next) => {
  next(createAppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

app.use(errorHandler);

export default app;

