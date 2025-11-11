import express from "express";
import passport from "passport";
import { register, login, logout, me, googleCallback, completeProfile } from "./auth.controller.js";
import { authenticate } from "../../core/middlewares/index.js";
import { 
  validateRegister, 
  validateLogin
} from "./auth.validation.js";

/**
 * Auth Routes
 * Handles all authentication-related endpoints
 */
function createAuthRoutes() {
  const router = express.Router();

  // Local authentication routes
  router.post("/register", validateRegister, register);
  router.post("/login", validateLogin, login);
  router.post("/logout", logout);
  router.get("/me", authenticate, me);
  // Accept both POST and PUT for complete-profile for backward compatibility
  router.post("/complete-profile", authenticate, completeProfile);
  router.put("/complete-profile", authenticate, completeProfile);

  // Debug endpoint to verify OAuth configuration
  router.get("/oauth-config", (req, res) => {
    res.json({
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...",
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback",
      clientURL: process.env.CLIENT_URL || "http://localhost:5174",
      nodeEnv: process.env.NODE_ENV
    });
  });

  // Google OAuth routes - only if Google credentials are available
  const clientURL = process.env.CLIENT_URL || "http://localhost:5174";
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    router.get("/google", 
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    router.get("/google/callback",
      (req, res, next) => {
        console.log("📥 Incoming Google callback:");
        console.log("   Query params:", req.query);
        console.log("   Headers origin:", req.headers.origin);
        console.log("   Session ID:", req.sessionID);
        next();
      },
      passport.authenticate("google", { 
        failureRedirect: `${clientURL}/login?error=authentication_failed`
      }),
      (err, req, res, next) => {
        // Custom error handler for passport authentication
        if (err) {
          console.error("❌ Passport authentication error:", err.message);
          console.error("   Stack:", err.stack);
          return res.status(500).json({
            success: false,
            status: 500,
            message: "Unauthorized",
            debug: process.env.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        next(err);
      },
      googleCallback
    );
  } else {
    // Fallback routes when Google OAuth is not configured
    router.get("/google", (req, res) => {
      res.status(503).json({ 
        success: false, 
        message: "Google OAuth is not configured" 
      });
    });
    
    router.get("/google/callback", (req, res) => {
      res.status(503).json({ 
        success: false, 
        message: "Google OAuth is not configured" 
      });
    });
  }

  return router;
}

export default createAuthRoutes;

