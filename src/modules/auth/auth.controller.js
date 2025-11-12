import { registerLocal, loginLocal, completeProfile as completeProfileService } from "./auth.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError } from "../../core/errors/index.js";
import { UserDTO } from "../shared/dtos/index.js";
import { TokenService } from "../shared/services/index.js";
import User from "../../models/User.js";

/**
 * Register a new user
 * @route POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  // Use validated data from middleware
  const { name, email, password, role } = req.validatedData;

  const { user, token } = await registerLocal({ name, email, password, role });
  
  // Set cookie and return response
  res.cookie("token", token, TokenService.getCookieOptions());
  
  successResponse(
    res,
    {
      user: new UserDTO(user),
      token
    },
    "Registration successful",
    201
  );
});

/**
 * Login user
 * @route POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  // Use validated data from middleware
  const { email, password } = req.validatedData;
  
  const { user, token } = await loginLocal({ email, password });
  
  // Set cookie and return response
  res.cookie("token", token, TokenService.getCookieOptions());
  
  successResponse(
    res,
    {
      user: new UserDTO(user),
      token
    },
    "Login successful"
  );
});


/**
 * Google OAuth callback
 * @route GET /api/auth/google/callback
 */
export const googleCallback = asyncHandler(async (req, res) => {
  if (!req.user) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';
    return res.redirect(`${clientUrl}/login?error=authentication_failed`);
  }
  
  const token = TokenService.generateToken(req.user);
  res.cookie("token", token, TokenService.getCookieOptions());
  
  // Check if profile is complete
  const isProfileComplete = req.user.isProfileComplete && req.user.role;
  
  // Redirect to client's Google callback handler with token
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';
  
  if (!isProfileComplete) {
    // Profile incomplete - redirect to complete profile page
    res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&profileIncomplete=true`);
  } else {
    // Profile complete - redirect to dashboard
    res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&success=true`);
  }
});

/**
 * Complete user profile
 * @route POST/PUT /api/auth/complete-profile
 */
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

  // Role-specific validation
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

  const user = await completeProfileService(userId, profileData);

  successResponse(
    res,
    { user: new UserDTO(user) },
    'Profile completed successfully'
  );
});

/**
 * Logout user
 * @route POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("token", { 
    httpOnly: true, 
    sameSite: "lax" 
  });
  
  successResponse(res, null, "Logged out successfully");
});

/**
 * Get current user
 * @route GET /api/auth/me
 */
export const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError("Not authenticated", 401);
  }
  
  // Fetch complete user data from database
  const user = await User.findById(req.user.id).select('-password');
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "User retrieved successfully"
  );
});