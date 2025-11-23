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
    throw new AppError("Email already registered", 400);
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
    throw new AppError('User not found', 404);
  }

  // Validate role
  if (!role || !['freelancer', 'client'].includes(role)) {
    throw new AppError('Valid role (freelancer or client) is required', 400);
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
      throw new AppError('At least one skill is required for freelancers', 400);
    }
    if (!hourlyRate || hourlyRate <= 0) {
      throw new AppError('Valid hourly rate is required for freelancers', 400);
    }
    if (!experience) {
      throw new AppError('Experience level is required for freelancers', 400);
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
      throw new AppError('Company name is required for clients', 400);
    }
    if (!companySize) {
      throw new AppError('Company size is required for clients', 400);
    }
    if (!industry) {
      throw new AppError('Industry is required for clients', 400);
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
    throw new AppError('Failed to complete profile', 500);
  }

  return savedUser;
};

export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  
  if (!user || user.provider !== "local") {
    throw new AppError("Invalid credentials", 401);
  }
  
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw new AppError("Invalid credentials", 401);
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
    throw new AppError(
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
    throw new AppError("Failed to send OTP email. Please try again later", 500);
  }
  
  return { message: "OTP sent successfully to your email" };
};

// Verify OTP
export const verifyOTPService = async (email, otp) => {
  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires');
  
  if (!user) {
    throw new AppError("Invalid credentials", 400);
  }
  
  // Check if user is local provider
  if (user.provider !== "local") {
    throw new AppError(`This account uses ${user.provider === 'google' ? 'Google' : user.provider} sign-in. Password reset is not available for OAuth accounts.`, 400);
  }
  
  // Check if OTP exists
  if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
    throw new AppError("No OTP request found. Please request a new OTP", 400);
  }
  
  // Check if OTP has expired
  if (isOTPExpired(user.resetPasswordOTPExpires)) {
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw new AppError("OTP has expired. Please request a new one", 400);
  }
  
  // Verify OTP
  const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);
  
  if (!isValid) {
    throw new AppError("Invalid OTP", 400);
  }
  
  return { message: "OTP verified successfully", verified: true };
};

// Reset password with OTP
export const resetPassword = async (email, otp, newPassword) => {
  // Find user with OTP fields
  const user = await User.findOne({ email })
    .select('+resetPasswordOTP +resetPasswordOTPExpires +password');
  
  if (!user) {
    throw new AppError("Invalid credentials", 400);
  }
  
  if (user.provider !== "local") {
    throw new AppError(`This account uses ${user.provider === 'google' ? 'Google' : user.provider} sign-in. Password reset is not available for OAuth accounts.`, 400);
  }
  
  // Check if OTP exists
  if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
    throw new AppError("No OTP request found. Please request a new OTP", 400);
  }
  
  // Check if OTP has expired
  if (isOTPExpired(user.resetPasswordOTPExpires)) {
    // Clear expired OTP
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();
    throw new AppError("OTP has expired. Please request a new one", 400);
  }
  
  // Verify OTP
  const isValid = await verifyOTPUtil(otp, user.resetPasswordOTP);
  
  if (!isValid) {
    throw new AppError("Invalid OTP", 400);
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

// Submit CNIC for verification
export const submitCNIC = async (userId, cnicNumber, frontImagePath, backImagePath) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check if CNIC is already verified
  if (user.cnicVerificationStatus === 'verified') {
    throw new AppError('CNIC is already verified', 400);
  }

  // Check if CNIC number is already used by another user
  const existingUser = await User.findOne({ 
    cnicNumber, 
    _id: { $ne: userId },
    cnicVerificationStatus: { $in: ['verified', 'pending'] }
  });

  if (existingUser) {
    throw new AppError('This CNIC number is already registered with another account', 400);
  }

  // Update user CNIC information
  user.cnicNumber = cnicNumber;
  user.cnicFrontImage = frontImagePath;
  user.cnicBackImage = backImagePath;
  user.cnicVerificationStatus = 'pending';
  user.cnicSubmittedAt = new Date();
  user.cnicRejectionReason = undefined; // Clear any previous rejection reason

  await user.save();

  return user;
};

// Upload CNIC front image
export const uploadCNICFront = async (userId, imagePath) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.cnicFrontImage = imagePath;
  await user.save();

  return { imagePath, message: 'CNIC front image uploaded successfully' };
};

// Upload CNIC back image
export const uploadCNICBack = async (userId, imagePath) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.cnicBackImage = imagePath;
  await user.save();

  return { imagePath, message: 'CNIC back image uploaded successfully' };
};

// Get CNIC verification status
export const getCNICStatus = async (userId) => {
  const user = await User.findById(userId).select('cnicNumber cnicVerificationStatus cnicVerifiedAt cnicRejectionReason cnicSubmittedAt');
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Mask CNIC number for security (show only last 4 digits)
  let maskedCNIC = null;
  if (user.cnicNumber) {
    const parts = user.cnicNumber.split('-');
    if (parts.length === 3) {
      maskedCNIC = `XXXXX-XXXXXXX-${parts[2]}`;
    }
  }

  return {
    cnicNumber: maskedCNIC, // Return masked version
    status: user.cnicVerificationStatus,
    verifiedAt: user.cnicVerifiedAt,
    rejectionReason: user.cnicRejectionReason,
    submittedAt: user.cnicSubmittedAt
  };
};

// Admin: Verify CNIC
export const verifyCNIC = async (adminId, userId, status, rejectionReason = null) => {
  // Check if admin user exists and is admin
  const admin = await User.findById(adminId);
  if (!admin || admin.role !== 'admin') {
    throw new AppError('Unauthorized. Admin access required', 403);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.cnicVerificationStatus !== 'pending') {
    throw new AppError(`CNIC verification status is ${user.cnicVerificationStatus}. Only pending verifications can be processed`, 400);
  }

  if (status === 'verified') {
    user.cnicVerificationStatus = 'verified';
    user.cnicVerifiedAt = new Date();
    user.cnicVerifiedBy = adminId;
    user.cnicRejectionReason = undefined;
  } else if (status === 'rejected') {
    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new AppError('Rejection reason is required when rejecting CNIC verification', 400);
    }
    user.cnicVerificationStatus = 'rejected';
    user.cnicRejectionReason = rejectionReason.trim();
    user.cnicVerifiedAt = undefined;
    user.cnicVerifiedBy = undefined;
  } else {
    throw new AppError('Invalid status. Must be either "verified" or "rejected"', 400);
  }

  await user.save();

  return user;
};

// Admin: Get all pending CNIC verifications
export const getPendingCNICVerifications = async (adminId, page = 1, limit = 10) => {
  // Check if admin user exists and is admin
  const admin = await User.findById(adminId);
  if (!admin || admin.role !== 'admin') {
    throw new AppError('Unauthorized. Admin access required', 403);
  }

  const skip = (page - 1) * limit;

  const query = { cnicVerificationStatus: 'pending' };
  
  const [users, total] = await Promise.all([
    User.find(query)
      .select('name email cnicNumber cnicFrontImage cnicBackImage cnicSubmittedAt role')
      .sort({ cnicSubmittedAt: 1 }) // Oldest first
      .skip(skip)
      .limit(limit),
    User.countDocuments(query)
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};
