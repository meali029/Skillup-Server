import express from "express";
import passport from "passport";
import { 
  register, 
  login, 
  logout, 
  me, 
  googleCallback, 
  completeProfile, 
  requestPasswordResetController, 
  verifyOTPController, 
  resetPasswordController,
  uploadCNICFrontController,
  uploadCNICBackController,
  submitCNICController,
  getCNICStatusController,
  getPendingCNICVerificationsController,
  verifyCNICController
} from "./auth.controller.js";
import { authenticate, authorize } from "../../core/middlewares/index.js";
import { uploadCNICSingle, handleUploadError } from "../../core/middlewares/upload.js";
import { 
  validateRegister, 
  validateLogin,
  validateRequestPasswordReset,
  validateVerifyOTP,
  validateResetPassword,
  validateSubmitCNIC,
  validateVerifyCNIC
} from "./auth.validation.js";

function createAuthRoutes() {
  const router = express.Router();

  router.post("/register", validateRegister, register);
  router.post("/login", validateLogin, login);
  router.post("/logout", logout);
  router.get("/me", authenticate, me);
  router.post("/complete-profile", authenticate, completeProfile);
  router.put("/complete-profile", authenticate, completeProfile);

  // Forgot password routes (rate limiting removed)
  router.post("/forgot-password", validateRequestPasswordReset, requestPasswordResetController);
  router.post("/verify-otp", validateVerifyOTP, verifyOTPController);
  router.post("/reset-password", validateResetPassword, resetPasswordController);

  // CNIC Verification Routes (User)
  router.post("/cnic/front", authenticate, uploadCNICSingle("cnicFront"), handleUploadError, uploadCNICFrontController);
  router.post("/cnic/back", authenticate, uploadCNICSingle("cnicBack"), handleUploadError, uploadCNICBackController);
  router.post("/cnic/submit", authenticate, validateSubmitCNIC, submitCNICController);
  router.get("/cnic/status", authenticate, getCNICStatusController);

  // CNIC Verification Routes (Admin)
  router.get("/admin/cnic/pending", authenticate, authorize('admin'), getPendingCNICVerificationsController);
  router.post("/admin/cnic/verify/:userId", authenticate, authorize('admin'), validateVerifyCNIC, verifyCNICController);

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

  const clientURL = process.env.CLIENT_URL || "http://localhost:5174";
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    router.get("/google", 
      (req, res, next) => {
        // Pass through the prompt parameter to force account selection
        const prompt = req.query.prompt || 'consent';
        
        passport.authenticate("google", {
          scope: ["profile", "email"],
          prompt: prompt, // 'select_account' forces Google to show account picker
          session: false,
        })(req, res, next);
      }
    );

    router.get("/google/callback",
      (req, res, next) => {
        passport.authenticate("google", { 
          failureRedirect: `${clientURL}/login?error=authentication_failed`,
          session: true
        }, (err, user, info) => {
          if (err) {
            // Pass ban/suspension error messages to the client
            const errorMessage = encodeURIComponent(err.message || 'authentication_failed');
            return res.redirect(`${clientURL}/login?error=${errorMessage}`);
          }
          
          if (!user) {
            return res.redirect(`${clientURL}/login?error=authentication_failed`);
          }
          
          req.logIn(user, (err) => {
            if (err) {
              return next(err);
            }
            next();
          });
        })(req, res, next);
      },
      googleCallback
    );
  } else {
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

