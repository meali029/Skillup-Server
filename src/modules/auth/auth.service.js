import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { AppError } from "../../core/errors/index.js";
import { TokenService } from "../shared/services/index.js";

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

