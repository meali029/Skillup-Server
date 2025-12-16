import { 
  registerLocal, 
  loginLocal, 
  completeProfile as completeProfileService, 
  requestPasswordReset, 
  verifyOTPService, 
  resetPassword,
  submitCNIC,
  uploadCNICFront,
  uploadCNICBack,
  getCNICStatus,
  verifyCNIC,
  getPendingCNICVerifications
} from "./auth.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError } from "../../core/errors/index.js";
import { formatUser } from "../shared/dtos/index.js";
import { TokenService } from "../shared/services/index.js";
import User from "../../models/User.js";
import { createAuditLog } from "../../core/utils/auditLogger.js";

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
    throw new AppError('Role is required', 400);
  }

  if (!['freelancer', 'client'].includes(profileData.role)) {
    throw new AppError('Role must be either freelancer or client', 400);
  }

  if (profileData.role === 'freelancer') {
    if (!profileData.skills || profileData.skills.length === 0) {
      throw new AppError('At least one skill is required for freelancers', 400);
    }
    if (!profileData.hourlyRate) {
      throw new AppError('Hourly rate is required for freelancers', 400);
    }
    if (!profileData.experience) {
      throw new AppError('Experience level is required for freelancers', 400);
    }
  } else if (profileData.role === 'client') {
    if (!profileData.companyName) {
      throw new AppError('Company name is required for clients', 400);
    }
    if (!profileData.companySize) {
      throw new AppError('Company size is required for clients', 400);
    }
    if (!profileData.industry) {
      throw new AppError('Industry is required for clients', 400);
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
    throw new AppError("Not authenticated", 401);
  }
  
  const user = await User.findById(req.user.id).select('-password');
  
  if (!user) {
    throw new AppError("User not found", 404);
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

// CNIC Verification Controllers
export const uploadCNICFrontController = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded", 400);
  }
  
  const imagePath = `/uploads/${req.file.filename}`;
  const result = await uploadCNICFront(req.user.id, imagePath);
  
  successResponse(
    res,
    { imagePath: result.imagePath },
    result.message,
    200
  );
});

export const uploadCNICBackController = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded", 400);
  }
  
  const imagePath = `/uploads/${req.file.filename}`;
  const result = await uploadCNICBack(req.user.id, imagePath);
  
  successResponse(
    res,
    { imagePath: result.imagePath },
    result.message,
    200
  );
});

export const submitCNICController = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { cnicNumber } = req.validatedData;
  
  // Check if both images are uploaded
  const user = await User.findById(userId).select('cnicFrontImage cnicBackImage');
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  if (!user.cnicFrontImage || !user.cnicBackImage) {
    throw new AppError('Both CNIC front and back images are required before submission', 400);
  }
  
  const updatedUser = await submitCNIC(userId, cnicNumber, user.cnicFrontImage, user.cnicBackImage);
  
  successResponse(
    res,
    { 
      user: formatUser(updatedUser),
      cnicStatus: updatedUser.cnicVerificationStatus 
    },
    'CNIC submitted for verification successfully',
    200
  );
});

export const getCNICStatusController = asyncHandler(async (req, res) => {
  const status = await getCNICStatus(req.user.id);
  
  successResponse(
    res,
    status,
    'CNIC status retrieved successfully',
    200
  );
});

// Admin CNIC Verification Controllers
export const getPendingCNICVerificationsController = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  const result = await getPendingCNICVerifications(req.user.id, page, limit);
  
  // Format users with CNIC details for admin review
  const verifications = result.users.map(user => {
    const formatted = formatUser(user);
    // Include CNIC details for admin review
    formatted.cnicNumber = user.cnicNumber;
    formatted.cnicFrontImage = user.cnicFrontImage;
    formatted.cnicBackImage = user.cnicBackImage;
    formatted.cnicSubmittedAt = user.cnicSubmittedAt;
    return formatted;
  });
  
  successResponse(
    res,
    {
      verifications,
      pagination: result.pagination
    },
    'Pending CNIC verifications retrieved successfully',
    200
  );
});

export const verifyCNICController = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const userId = req.params.userId;
  const { status, rejectionReason } = req.validatedData;
  
  const updatedUser = await verifyCNIC(adminId, userId, status, rejectionReason);
  
  successResponse(
    res,
    { user: formatUser(updatedUser) },
    `CNIC ${status === 'verified' ? 'verified' : 'rejected'} successfully`,
    200
  );
});
