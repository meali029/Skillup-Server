import express from "express";
import passport from "passport";
import { 
  register, 
  login, 
  logout, 
  me, 
  getMySessions,
  revokeMySession,
  revokeMyOtherSessions,
  googleCallback, 
  completeProfile, 
  requestPasswordResetController, 
  verifyOTPController, 
  resetPasswordController,
  verifyEmailController,
  resendVerificationController,
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

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - email
   *               - password
   *               - role
   *             properties:
   *               name:
   *                 type: string
   *                 example: John Doe
   *               email:
   *                 type: string
   *                 format: email
   *                 example: john@example.com
   *               password:
   *                 type: string
   *                 format: password
   *                 minLength: 8
   *               role:
   *                 type: string
   *                 enum: [client, freelancer]
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 token:
   *                   type: string
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       400:
   *         description: Validation error or user already exists
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post("/register", validateRegister, register);

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 format: password
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 token:
   *                   type: string
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Invalid credentials
   *       403:
   *         description: Account banned or suspended
   */
  router.post("/login", validateLogin, login);

  /**
   * @swagger
   * /api/auth/verify-email:
   *   get:
   *     summary: Verify email with token
   *     tags: [Auth]
   *     parameters:
   *       - in: query
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *         description: Email verification token
   *     responses:
   *       302:
   *         description: Redirects to frontend login page with success message
   *       400:
   *         description: Invalid or expired token
   */
  router.get("/verify-email", verifyEmailController);

  /**
   * @swagger
   * /api/auth/resend-verification:
   *   post:
   *     summary: Resend email verification link
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *     responses:
   *       200:
   *         description: Verification email sent
   *       400:
   *         description: Email already verified or not found
   */
  router.post("/resend-verification", resendVerificationController);

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Logout user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Logout successful
   */
  router.post("/logout", logout);

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Get current authenticated user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Current user data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Not authenticated
   */
  router.get("/me", authenticate, me);

  router.get("/sessions", authenticate, getMySessions);
  router.delete("/sessions/others", authenticate, revokeMyOtherSessions);
  router.delete("/sessions/:sessionId", authenticate, revokeMySession);

  /**
   * @swagger
   * /api/auth/complete-profile:
   *   post:
   *     summary: Complete user profile after OAuth registration
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - role
   *             properties:
   *               role:
   *                 type: string
   *                 enum: [client, freelancer]
   *               skills:
   *                 type: array
   *                 items:
   *                   type: string
   *               bio:
   *                 type: string
   *     responses:
   *       200:
   *         description: Profile completed successfully
   *       401:
   *         description: Not authenticated
   */
  router.post("/complete-profile", authenticate, completeProfile);

  /**
   * @swagger
   * /api/auth/complete-profile:
   *   put:
   *     summary: Update user profile completion
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               role:
   *                 type: string
   *                 enum: [client, freelancer]
   *               skills:
   *                 type: array
   *                 items:
   *                   type: string
   *               bio:
   *                 type: string
   *     responses:
   *       200:
   *         description: Profile updated successfully
   *       401:
   *         description: Not authenticated
   */
  router.put("/complete-profile", authenticate, completeProfile);

  /**
   * @swagger
   * /api/auth/forgot-password:
   *   post:
   *     summary: Request password reset OTP
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *     responses:
   *       200:
   *         description: OTP sent to email
   *       404:
   *         description: User not found
   */
  router.post("/forgot-password", validateRequestPasswordReset, requestPasswordResetController);

  /**
   * @swagger
   * /api/auth/verify-otp:
   *   post:
   *     summary: Verify OTP for password reset
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - otp
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               otp:
   *                 type: string
   *     responses:
   *       200:
   *         description: OTP verified successfully
   *       400:
   *         description: Invalid or expired OTP
   */
  router.post("/verify-otp", validateVerifyOTP, verifyOTPController);

  /**
   * @swagger
   * /api/auth/reset-password:
   *   post:
   *     summary: Reset password with verified OTP
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - otp
   *               - newPassword
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               otp:
   *                 type: string
   *               newPassword:
   *                 type: string
   *                 format: password
   *                 minLength: 8
   *     responses:
   *       200:
   *         description: Password reset successfully
   *       400:
   *         description: Invalid OTP or validation error
   */
  router.post("/reset-password", validateResetPassword, resetPasswordController);

  /**
   * @swagger
   * /api/auth/cnic/front:
   *   post:
   *     summary: Upload CNIC front image
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               cnicFront:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: CNIC front uploaded successfully
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Invalid file
   */
  router.post("/cnic/front", authenticate, uploadCNICSingle("cnicFront"), handleUploadError, uploadCNICFrontController);

  /**
   * @swagger
   * /api/auth/cnic/back:
   *   post:
   *     summary: Upload CNIC back image
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               cnicBack:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: CNIC back uploaded successfully
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Invalid file
   */
  router.post("/cnic/back", authenticate, uploadCNICSingle("cnicBack"), handleUploadError, uploadCNICBackController);

  /**
   * @swagger
   * /api/auth/cnic/submit:
   *   post:
   *     summary: Submit CNIC for verification
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - cnicNumber
   *             properties:
   *               cnicNumber:
   *                 type: string
   *                 pattern: '^[0-9]{5}-[0-9]{7}-[0-9]$'
   *                 example: "35202-1234567-1"
   *     responses:
   *       200:
   *         description: CNIC submitted for verification
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Validation error
   */
  router.post("/cnic/submit", authenticate, validateSubmitCNIC, submitCNICController);

  /**
   * @swagger
   * /api/auth/cnic/status:
   *   get:
   *     summary: Get CNIC verification status
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: CNIC verification status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 status:
   *                   type: string
   *                   enum: [not_submitted, pending, verified, rejected]
   *       401:
   *         description: Not authenticated
   */
  router.get("/cnic/status", authenticate, getCNICStatusController);

  /**
   * @swagger
   * /api/auth/admin/cnic/pending:
   *   get:
   *     summary: Get pending CNIC verifications (Admin)
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of pending CNIC verifications
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Not authorized (admin only)
   */
  router.get("/admin/cnic/pending", authenticate, authorize('admin'), getPendingCNICVerificationsController);

  /**
   * @swagger
   * /api/auth/admin/cnic/verify/{userId}:
   *   post:
   *     summary: Verify or reject CNIC (Admin)
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - action
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [approve, reject]
   *               reason:
   *                 type: string
   *     responses:
   *       200:
   *         description: CNIC verification updated
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Not authorized (admin only)
   */
  router.post("/admin/cnic/verify/:userId", authenticate, authorize('admin'), validateVerifyCNIC, verifyCNICController);

  /**
   * @swagger
   * /api/auth/oauth-config:
   *   get:
   *     summary: Get OAuth configuration status
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: OAuth configuration
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 hasGoogleClientId:
   *                   type: boolean
   *                 hasGoogleClientSecret:
   *                   type: boolean
   */
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
    /**
     * @swagger
     * /api/auth/google:
     *   get:
     *     summary: Initiate Google OAuth login
     *     tags: [Auth]
     *     parameters:
     *       - in: query
     *         name: prompt
     *         schema:
     *           type: string
     *           enum: [consent, select_account]
     *         description: OAuth prompt parameter
     *     responses:
     *       302:
     *         description: Redirect to Google OAuth
     *       503:
     *         description: Google OAuth not configured
     */
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

    /**
     * @swagger
     * /api/auth/google/callback:
     *   get:
     *     summary: Google OAuth callback
     *     tags: [Auth]
     *     parameters:
     *       - in: query
     *         name: code
     *         schema:
     *           type: string
     *         description: OAuth authorization code
     *     responses:
     *       302:
     *         description: Redirect to client with token or error
     */
    router.get("/google/callback",
      (req, res, next) => {
        passport.authenticate("google", { 
          failureRedirect: `${clientURL}/login?error=authentication_failed`,
          session: true
        }, (err, user, info) => {
          if (err) {
            console.error('[Google OAuth] Callback error:', err.message);
            console.error('[Google OAuth] Error stack:', err.stack);
            const errorMessage = encodeURIComponent(err.message || 'authentication_failed');
            return res.redirect(`${clientURL}/login?error=${errorMessage}`);
          }
          
          if (!user) {
            console.warn('[Google OAuth] No user returned from strategy. Info:', info);
            return res.redirect(`${clientURL}/login?error=authentication_failed`);
          }
          
          console.info(`[Google OAuth] User authenticated: ${user.email} (provider: ${user.provider})`);
          
          req.logIn(user, (loginErr) => {
            if (loginErr) {
              console.error('[Google OAuth] Session login error:', loginErr.message);
              console.error('[Google OAuth] Login error stack:', loginErr.stack);
              return res.redirect(`${clientURL}/login?error=${encodeURIComponent(loginErr.message || 'session_error')}`);
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
