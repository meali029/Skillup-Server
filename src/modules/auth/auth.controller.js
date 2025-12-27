import { 
  registerLocal, 
  loginLocal, 
  completeProfile as completeProfileService, 
  requestPasswordReset, 
  verifyOTPService, 
  resetPassword
} from "./auth.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError, createAppError } from "../../core/errors/index.js";
import { formatUser } from "../shared/dtos/index.js";
import { TokenService } from "../shared/services/index.js";
import User from "../../models/User.js";
import { createAuditLog } from "../../core/utils/auditLogger.js";
import { notifyUser } from '../notifications/notification.service.js';

export const register = asyncHandler(async (req, res) => {
  // Extract all possible registration fields from validatedData or body
  const registrationData = req.validatedData || req.body;

  const { user, token } = await registerLocal(registrationData);
  
  res.cookie("token", token, TokenService.getCookieOptions());
  
  successResponse(
    res,
    {
      user: formatUser(user),
      token,
      isProfileComplete: user.isProfileComplete
    },
    "Registration successful",
    201
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedData;
  
  const { user, token } = await loginLocal({ email, password });
  
  res.cookie("token", token, TokenService.getCookieOptions());
  
  // Log admin login
  if (user.role === 'admin') {
    await createAuditLog({
      adminId: user._id,
      action: 'ADMIN_LOGIN',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      details: {
        email: user.email,
        loginTime: new Date(),
      },
    });
  }
    // Notify user about login
    try {
      await notifyUser(user._id || user.id, {
        type: 'login',
        title: 'Login successful',
        message: `You logged in at ${new Date().toLocaleString()}`,
        link: '/profile',
        data: { ip: req.ip }
      });
    } catch (err) {
      console.error('[Notification] Failed to notify user about login', err.message);
    }
  
  successResponse(
    res,
    {
      user: formatUser(user),
      token
    },
    "Login successful"
  );
});

export const googleCallback = asyncHandler(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';
  
  if (!req.user) {
    // Check if there's an error message from passport (e.g., ban/suspension)
    const errorMessage = req.session?.messages?.[0] || 'authentication_failed';
    return res.redirect(`${clientUrl}/login?error=${encodeURIComponent(errorMessage)}`);
  }
  
  const token = TokenService.generateToken(req.user);
  res.cookie("token", token, TokenService.getCookieOptions());
  
  const isProfileComplete = req.user.isProfileComplete && req.user.role;
  
  if (!isProfileComplete) {
    res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&profileIncomplete=true`);
  } else {
    res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&success=true`);
  }
});

export const completeProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profileData = req.body;

  // Validate required fields
  if (!profileData.role) {
    throw createAppError('Role is required', 400);
  }

  if (!['freelancer', 'client'].includes(profileData.role)) {
    throw createAppError('Role must be either freelancer or client', 400);
  }

  if (profileData.role === 'freelancer') {
    if (!profileData.skills || profileData.skills.length === 0) {
      throw createAppError('At least one skill is required for freelancers', 400);
    }
    if (!profileData.hourlyRate) {
      throw createAppError('Hourly rate is required for freelancers', 400);
    }
    if (!profileData.experience) {
      throw createAppError('Experience level is required for freelancers', 400);
    }
  } else if (profileData.role === 'client') {
    if (!profileData.companyName) {
      throw createAppError('Company name is required for clients', 400);
    }
    if (!profileData.companySize) {
      throw createAppError('Company size is required for clients', 400);
    }
    if (!profileData.industry) {
      throw createAppError('Industry is required for clients', 400);
    }
  }

  // Complete profile
  const updatedUser = await completeProfileService(userId, profileData);
  
  // Verify the user was updated correctly
  const verifiedUser = await User.findById(userId).select('-password');

  // Generate new token with updated user data
  const token = TokenService.generateToken(verifiedUser);

  successResponse(
    res,
    { 
      user: formatUser(verifiedUser),
      token, // Send new token with updated claims
      isProfileComplete: verifiedUser.isProfileComplete 
    },
    'Profile completed successfully',
    200
  );
});

export const logout = asyncHandler(async (req, res) => {
  // Log admin logout
  if (req.user && req.user.role === 'admin') {
    await createAuditLog({
      adminId: req.user.id,
      action: 'ADMIN_LOGOUT',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      details: {
        logoutTime: new Date(),
      },
    });
  }
  
  res.clearCookie("token", { 
    httpOnly: true, 
    sameSite: "lax" 
  });
  
  successResponse(res, null, "Logged out successfully");
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw createAppError("Not authenticated", 401);
  }
  
  const user = await User.findById(req.user.id).select('-password');
  
  if (!user) {
    throw createAppError("User not found", 404);
  }
  
  successResponse(
    res,
    { user: formatUser(user) },
    "User retrieved successfully"
  );
});


export const requestPasswordResetController = asyncHandler(async (req, res) => {
  const { email } = req.validatedData;
  
  const result = await requestPasswordReset(email);
  
  successResponse(
    res,
    null,
    result.message,
    200
  );
});

export const verifyOTPController = asyncHandler(async (req, res) => {
  const { email, otp } = req.validatedData;
  
  const result = await verifyOTPService(email, otp);
  
  successResponse(
    res,
    { verified: result.verified },
    result.message,
    200
  );
});

export const resetPasswordController = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.validatedData;
  
  const result = await resetPassword(email, otp, newPassword);
  
  successResponse(
    res,
    null,
    result.message,
    200
  );
});

// CNIC Verification Controllers - Placeholder exports for backward compatibility
// The actual CNIC functionality should use the CNIC module routes at /api/cnic/*
export const uploadCNICFrontController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});

export const uploadCNICBackController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});

export const submitCNICController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});

export const getCNICStatusController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});

export const getPendingCNICVerificationsController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});

export const verifyCNICController = asyncHandler(async (req, res) => {
  throw createAppError("Please use /api/cnic/* routes for CNIC operations", 400);
});
