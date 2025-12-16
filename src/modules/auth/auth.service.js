import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { AppError } from "../../core/errors/index.js";
import { TokenService } from "../shared/services/index.js";
import { generateOTPData, verifyOTP as verifyOTPUtil, isOTPExpired } from "../../core/utils/otpService.js";
import { sendOTPEmail, sendPasswordResetConfirmation } from "../../core/utils/emailService.js";

export const registerLocal = async (registrationData) => {
  const { 
    name, email, password, role, bio, location, phone,
    skills, hourlyRate, experience, 
    companyName, companySize, industry 
  } = registrationData;

  const exists = await User.findOne({ email });
  if (exists) {
    throw AppError("Email already registered", 400);
  }

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
  
  // Reload user to get the saved state
  const savedUser = await User.findById(user._id).select('-password');
  
  const token = TokenService.generateToken(savedUser);
  
  return { user: savedUser, token };
};

export const completeProfile = async (userId, profileData) => {
  const { role, bio, location, phone, skills, hourlyRate, experience, companyName, companySize, industry } = profileData;

  const user = await User.findById(userId);
  if (!user) {
    throw AppError('User not found', 404);
  }

  // Validate role
  if (!role || !['freelancer', 'client'].includes(role)) {
    throw AppError('Valid role (freelancer or client) is required', 400);
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
      throw AppError('At least one skill is required for freelancers', 400);
    }
    if (!hourlyRate || hourlyRate <= 0) {
      throw AppError('Valid hourly rate is required for freelancers', 400);
    }
    if (!experience) {
      throw AppError('Experience level is required for freelancers', 400);
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
      throw AppError('Company name is required for clients', 400);
    }
    if (!companySize) {
      throw AppError('Company size is required for clients', 400);
    }
    if (!industry) {
      throw AppError('Industry is required for clients', 400);
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
    throw AppError('Failed to complete profile', 500);
  }

  return savedUser;
};

export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  
  if (!user || user.provider !== "local") {
    throw AppError("Invalid credentials", 401);
  }
  
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw AppError("Invalid credentials", 401);
  }

  // Check if user is banned
  if (user.isBanned) {
    throw AppError(
      "Your account has been banned. Please contact our help center for assistance.",
      403
    );
  }

  // Check if user is suspended
  if (!user.isActive) {
    throw AppError(
      "Your account has been suspended. Please contact our help center for assistance.",
      403
    );
  }
  
  // Remove password from user object
  const userWithoutPassword = user.toObject();
  delete userWithoutPassword.password;
  
  const token = TokenService.generateToken(user);
  
  return { user: userWithoutPassword, token };
};

// Request password reset - send OTP
export const requestPasswordReset = async (email) => {
  
  // Find user by email (check all providers first)
  const user = await User.findOne({ email });

  
  if (!user) {
    return { message: "If this email exists, an OTP has been sent" };
  }
  
  // Check if user signed up with OAuth (Google, etc.)
  if (user.provider !== "local") {
    throw AppError(
      `This account is linked with ${user.provider === 'google' ? 'Google' : user.provider}. Please sign in using ${user.provider === 'google' ? 'Google' : user.provider}.`,
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
    throw AppError("Failed to send OTP email. Please try again later", 500);
  }
  
  return { message: "OTP sent successfully to your email" };
};

// Verify OTP
export const verifyOTPService = async (email, otp) => {
  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires');
  
  if (!user) {
    throw AppError("Invalid credentials", 400);
  }
  
  // Check if user is local provider
  if (user.provider !== "local") {
    throw AppError(`This account uses ${user.provider === 'google' ? 'Google' : user.provider} sign-in. Password reset is not available for OAuth accounts.`, 400);
  }
  
  // Check if OTP exists
  if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
    throw AppError("No OTP request found. Please request a new OTP", 400);
  }
  
  // Check if OTP has expired
  if (isOTPExpired(user.resetPasswordOTPExpires)) {
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw AppError("OTP has expired. Please request a new one", 400);
  }
  
  // Verify OTP
  const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);
  
  if (!isValid) {
    throw AppError("Invalid OTP", 400);
  }
  
  return { message: "OTP verified successfully", verified: true };
};

// Reset password with OTP
export const resetPassword = async (email, otp, newPassword) => {
  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires +password');
  
  if (!user) {
    throw AppError("Invalid credentials", 400);
  }
  
  if (user.provider !== "local") {
    throw AppError(`This account uses ${user.provider === 'google' ? 'Google' : user.provider} sign-in. Password reset is not available for OAuth accounts.`, 400);
  }
  
  // Check if OTP exists
  if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
    throw AppError("No OTP request found. Please request a new OTP", 400);
  }
  
  // Check if OTP has expired
  if (isOTPExpired(user.resetPasswordOTPExpires)) {
    // Clear expired OTP
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw AppError("OTP has expired. Please request a new one", 400);
  }
  
  // Verify OTP
  const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);
  
  if (!isValid) {
    throw AppError("Invalid OTP", 400);
  }
  
  // Update password (will be hashed by pre-save middleware)
  user.password = newPassword;
  
  // Clear OTP fields
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires = undefined;
  
  await user.save();
  
  // Send confirmation email
  try {
    await sendPasswordResetConfirmation(email, user.name);
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }
  
  return { message: "Password reset successfully" };
};

