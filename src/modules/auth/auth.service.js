import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { AppError, createAppError } from "../../core/errors/index.js";
import { TokenService } from "../shared/services/index.js";
import { generateOTPData, verifyOTP as verifyOTPUtil, isOTPExpired } from "../../core/utils/otpService.js";
import { sendOTPEmail, sendPasswordResetConfirmation, sendEmailVerification, generateEmailVerificationToken, resendEmailVerification, verifyEmailConfig } from "../../core/utils/emailService.js";

export const registerLocal = async (registrationData) => {
  const { 
    name, email, password, role, bio, location, phone,
    skills, hourlyRate, experience, 
    companyName, companySize, industry 
  } = registrationData;

  const exists = await User.findOne({ email });
  if (exists) {
    // Security: Use same error for existing email to prevent enumeration
    throw createAppError("Email already registered", 400);
  }

  // Generate email verification token
  const emailVerificationToken = generateEmailVerificationToken();
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Build user data object
  const userData = {
    name,
    email,
    password,
    provider: "local",
    role: role || undefined,
    bio: bio || '',
    location: location || '',
    phone: phone || '',
    // Email verification - false for manual signup until verified
    isEmailVerified: false,
    emailVerificationToken,
    emailVerificationExpires,
  };

  // Add freelancer-specific fields
  if (role === 'freelancer') {
    userData.skills = skills && skills.length > 0 ? skills : [];
    userData.hourlyRate = hourlyRate ? parseFloat(hourlyRate) : undefined;
    userData.experience = experience || undefined;
  }

  // Add client-specific fields
  if (role === 'client') {
    userData.companyName = companyName || undefined;
    userData.companySize = companySize || undefined;
    userData.industry = industry || undefined;
  }

  const user = await User.create(userData);
  
  // Check if profile is complete using the model method
  const isComplete = user.checkProfileComplete();
  
  // Update isProfileComplete flag if needed
  if (isComplete !== user.isProfileComplete) {
    user.isProfileComplete = isComplete;
    await user.save();
  }
  
  // Send email verification
  try {
    await sendEmailVerification(email, name, emailVerificationToken);
  } catch (emailError) {
    console.error('[Auth Service] Failed to send verification email:', emailError);
    if (typeof User.findByIdAndDelete === 'function') {
      await User.findByIdAndDelete(user._id).catch(() => {});
    }
    throw createAppError("Failed to send verification email. Please try again later", 500);
  }
  
  // Reload user to get the saved state (without sensitive fields)
  const savedUser = await User.findById(user._id).select('-password');
  
  const token = TokenService.generateToken(savedUser);
  
  return { user: savedUser, token, requiresEmailVerification: true };
};

export const completeProfile = async (userId, profileData) => {
  const { role, bio, location, phone, skills, hourlyRate, experience, companyName, companySize, industry } = profileData;

  const user = await User.findById(userId);
  if (!user) {
    throw createAppError('User not found', 404);
  }

  // Validate role
  if (!role || !['freelancer', 'client'].includes(role)) {
    throw createAppError('Valid role (freelancer or client) is required', 400);
  }

  // Update basic fields
  user.role = role;
  user.bio = bio || '';
  user.location = location || '';
  user.phone = phone || '';

  // Role-specific fields with validation
  if (role === 'freelancer') {
    // Validate freelancer required fields
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      throw createAppError('At least one skill is required for freelancers', 400);
    }
    if (!hourlyRate || hourlyRate <= 0) {
      throw createAppError('Valid hourly rate is required for freelancers', 400);
    }
    if (!experience) {
      throw createAppError('Experience level is required for freelancers', 400);
    }

    user.skills = skills;
    user.hourlyRate = parseFloat(hourlyRate);
    user.experience = experience;
    
    // Clear client fields
    user.companyName = undefined;
    user.companySize = undefined;
    user.industry = undefined;
    
  } else if (role === 'client') {
    // Validate client required fields
    if (!companyName) {
      throw createAppError('Company name is required for clients', 400);
    }
    if (!companySize) {
      throw createAppError('Company size is required for clients', 400);
    }
    if (!industry) {
      throw createAppError('Industry is required for clients', 400);
    }

    user.companyName = companyName;
    user.companySize = companySize;
    user.industry = industry;
    
    // Clear freelancer fields
    user.skills = [];
    user.hourlyRate = undefined;
    user.experience = undefined;
  }

  // CRITICAL: Force profile completion to true
  user.isProfileComplete = true;

  // Save with validation
  await user.save({ validateBeforeSave: true });

  // Fetch fresh user data to confirm save
  const savedUser = await User.findById(userId).select('-password');

  // Double-check that profile is actually complete
  if (!savedUser.isProfileComplete) {
    throw createAppError('Failed to complete profile', 500);
  }

  return savedUser;
};

export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email })
    .select('+password')
    .populate('walletId', 'availableBalance');
  
  // Security: Same error for non-existent user to prevent email enumeration
  if (!user) {
    throw createAppError("Invalid credentials", 401);
  }
  
  // Allow login if provider is 'local' OR 'both' (linked account)
  // Deny only if provider is purely 'google' (no password ever set)
  if (user.provider === 'google') {
    throw createAppError(
      "This account uses Google sign-in. Please login with Google instead.",
      401
    );
  }
  
  // Check if user has a password (for safety)
  if (!user.password) {
    throw createAppError(
      "This account doesn't have a password. Please login with Google or reset your password.",
      401
    );
  }
  
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw createAppError("Invalid credentials", 401);
  }

  // Check if user is banned
  if (user.isBanned) {
    throw createAppError(
      "Your account has been banned. Please contact our help center for assistance.",
      403
    );
  }

  // Check if user is suspended
  if (!user.isActive) {
    throw createAppError(
      "Your account has been suspended. Please contact our help center for assistance.",
      403
    );
  }

  // CRITICAL: Check email verification for manual (local) users
  // Google users are verified by default, so this only affects local users
  if (!user.isEmailVerified) {
    throw createAppError(
      "Please verify your email before logging in. Check your inbox for the verification link.",
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }
  
  // Remove password from user object
  const userWithoutPassword = user.toObject();
  delete userWithoutPassword.password;
  
  const token = TokenService.generateToken(user);

  // Update lastLogin asynchronously (fire-and-forget)
  User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).catch(() => {});
  
  return { user: userWithoutPassword, token };
};

// Request password reset - send OTP
export const requestPasswordReset = async (email) => {
  
  // Find user by email (check all providers first)
  const user = await User.findOne({ email });

  
  if (!user) {
    return { message: "If this email exists, an OTP has been sent" };
  }
  
  // Check if user signed up with OAuth only (no password ever set)
  // Allow password reset for 'local' and 'both' providers
  if (user.provider === "google") {
    throw createAppError(
      "This account uses Google sign-in. Password reset is not available. Please sign in using Google.",
      400
    );
  }
  
  
  // Generate OTP data
  const { otp, hashedOTP, expiry } = await generateOTPData();
  
  
  // Store hashed OTP and expiry in database
  user.resetPasswordOTP = hashedOTP;
  user.resetPasswordOTPExpires = expiry;
  await user.save();
  
  
  // Send OTP via email
  try {
    await sendOTPEmail(email, otp, user.name);
  } catch (error) {
    // Rollback OTP storage if email fails
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw createAppError("Failed to send OTP email. Please try again later", 500);
  }
  
  return { message: "OTP sent successfully to your email" };
};

// Verify OTP
export const verifyOTPService = async (email, otp) => {
  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires');
  
  if (!user) {
    throw createAppError("Invalid credentials", 400);
  }
  
  // Check if user can reset password (local or both providers)
  if (user.provider === "google") {
    throw createAppError("This account uses Google sign-in. Password reset is not available for OAuth-only accounts.", 400);
  }
  
  // Check if OTP exists
  if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
    throw createAppError("No OTP request found. Please request a new OTP", 400);
  }
  
  // Check if OTP has expired
  if (isOTPExpired(user.resetPasswordOTPExpires)) {
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw createAppError("OTP has expired. Please request a new one", 400);
  }
  
  // Verify OTP
  const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);
  
  if (!isValid) {
    throw createAppError("Invalid OTP", 400);
  }

  // Mark OTP as verified so resetPassword can be called without re-supplying the OTP
  user.resetPasswordOTPVerified = true;
  await user.save();
  return { message: "OTP verified successfully", verified: true };
};

// Reset password with OTP
export const resetPassword = async (email, otp, newPassword) => {
  // Support calling resetPassword(email, newPassword) if OTP was previously verified
  if (typeof newPassword === 'undefined') {
    newPassword = otp; // second arg is actually newPassword
    otp = null;
  }

  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires +password +resetPasswordOTPVerified');

  if (!user) {
    throw createAppError("Invalid credentials", 400);
  }

  if (user.provider !== "local") {
    throw createAppError(`This account uses ${user.provider === 'google' ? 'Google' : user.provider} sign-in. Password reset is not available for OAuth accounts.`, 400);
  }

  // If OTP was not supplied, require that it's been verified earlier
  if (!otp) {
    if (!user.resetPasswordOTPVerified) {
      throw createAppError("No OTP request found. Please request a new OTP", 400);
    }
  } else {
    // Check if OTP exists
    if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
      throw createAppError("No OTP request found. Please request a new OTP", 400);
    }

    // Check if OTP has expired
    if (isOTPExpired(user.resetPasswordOTPExpires)) {
      // Clear expired OTP
      user.resetPasswordOTP = undefined;
      user.resetPasswordOTPExpires = undefined;
      await user.save();
      throw createAppError("OTP has expired. Please request a new one", 400);
    }

    // Verify OTP
    const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);

    if (!isValid) {
      throw createAppError("Invalid OTP", 400);
    }
  }

  // Update password (will be hashed by pre-save middleware)
  user.password = newPassword;

  // Clear OTP fields and verification flag
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires = undefined;
  user.resetPasswordOTPVerified = undefined;

  await user.save();

  // Send confirmation email
  try {
    await sendPasswordResetConfirmation(email, user.name);
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }

  return { message: "Password reset successfully" };
};

// Verify email with token
export const verifyEmailToken = async (token) => {
  if (!token) {
    throw createAppError("Verification token is required", 400);
  }

  // Find user with this verification token
  const user = await User.findOne({ 
    emailVerificationToken: token,
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    throw createAppError("Invalid or expired verification link. Please request a new one.", 400);
  }

  // Check if token has expired
  if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
    throw createAppError("Verification link has expired. Please request a new one.", 400);
  }

  // Mark email as verified and clear verification fields
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  // Return the full user object for auto-login after verification
  const verifiedUser = await User.findById(user._id).select('-password');

  return { 
    message: "Email verified successfully", 
    user: verifiedUser
  };
};

// Resend verification email
export const resendVerificationEmail = async (email) => {
  if (!email) {
    throw createAppError("Email is required", 400);
  }

  const user = await User.findOne({ email });

  // Security: Same response whether email exists or not
  if (!user) {
    return { message: "If this email is registered, a verification link has been sent." };
  }

  // Check if already verified
  if (user.isEmailVerified) {
    throw createAppError("This email is already verified. Please log in.", 400);
  }

  // Check if user is pure Google provider (should not need verification)
  if (user.provider === 'google') {
    throw createAppError("Google accounts do not require email verification.", 400);
  }

  // Before generating token, ensure email provider is available (fail fast with clear message)
  const emailReady = await verifyEmailConfig();
  if (!emailReady) {
    throw createAppError('Email service is currently unavailable. Please try again later.', 503);
  }

  // Generate new verification token
  const emailVerificationToken = generateEmailVerificationToken();
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  user.emailVerificationToken = emailVerificationToken;
  user.emailVerificationExpires = emailVerificationExpires;
  await user.save();

  // Send verification email
  try {
    await resendEmailVerification(email, user.name, emailVerificationToken);
  } catch (emailError) {
    console.error('[Auth Service] Failed to resend verification email:', emailError);
    throw createAppError("Failed to send verification email. Please try again later.", 500);
  }

  return { message: "Verification email has been sent. Please check your inbox." };
};
