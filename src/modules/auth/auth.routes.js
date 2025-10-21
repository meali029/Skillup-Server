import express from "express";
import passport from "passport";
import { register, login, logout, me, googleCallback, completeProfile } from "./auth.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { 
  validateRegister, 
  validateLogin, 
  validateRoleSelection,
  validateFreelancerProfile,
  validateClientProfile
} from "./auth.validation.js";

// Function to create routes after environment variables are loaded
export function createAuthRoutes() {
  const router = express.Router();

  // Local authentication routes
  router.post("/register", validateRegister, register);
  router.post("/login", validateLogin, login);
  router.post("/logout", logout);
  router.get("/me", authMiddleware, me);
  router.post("/complete-profile", authMiddleware, completeProfile);

  // Google OAuth routes - only if Google credentials are available
  const clientURL = process.env.CLIENT_URL || "http://localhost:5174";
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    
    router.get("/google", 
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    router.get("/google/callback",
      passport.authenticate("google", { 
        failureRedirect: `${clientURL}/login?error=authentication_failed`,
        session: false 
      }),
      googleCallback
    );
  } else {
    
    // Fallback routes when Google OAuth is not configured
    router.get("/google", (req, res) => {
      res.status(503).json({ error: "Google OAuth is not configured" });
    });
    
    router.get("/google/callback", (req, res) => {
      res.status(503).json({ error: "Google OAuth is not configured" });
    });
  }

  return router;
}

// Export the function as default
export default createAuthRoutes;
