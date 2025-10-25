import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { AppError } from "../../core/errors/index.js";
import { TokenService } from "../shared/services/index.js";

/**
 * Register a new user with local authentication
 * @param {Object} userData - User registration data
 * @returns {Object} User and token
 */
export const registerLocal = async ({ name, email, password, role }) => {
  // Check for existing user
  const exists = await User.findOne({ email });
  if (exists) {
    throw new AppError("Email already registered", 400);
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);

  // Prepare user data
  const userData = {
    name,
    email,
    password: hashed,
    role: role || undefined, // undefined allows user to select role later
    provider: "local"
  };

  // Create user
  const user = await User.create(userData);
  
  // Profile completion will be auto-calculated by the pre-save hook
  const isComplete = Boolean(user.checkProfileComplete());
  if (user.isProfileComplete !== isComplete) {
    user.isProfileComplete = isComplete;
    await user.save();
  }
  
  const token = TokenService.generateToken(user);
  
  return { user, token };
};


/**
 * Complete user profile after registration
 * @param {String} userId - User ID
 * @param {Object} profileData - Profile completion data
 * @returns {Object} Updated user
 */
export const completeProfile = async (userId, profileData) => {
  const { role, bio, location, phone, skills, hourlyRate, experience, companyName, companySize, industry } = profileData;

  console.log('completeProfile service called:', { userId, role });

  const user = await User.findById(userId);
  if (!user) {
    console.error('User not found:', userId);
    throw new AppError('User not found', 404);
  }

  console.log('User found:', { id: user._id, email: user.email, currentRole: user.role });

  // Validate role
  if (!role || !['freelancer', 'client'].includes(role)) {
    console.error('Invalid role:', role);
    throw new AppError('Valid role (freelancer or client) is required', 400);
  }

  // Update basic fields
  user.role = role;
  if (bio !== undefined) user.bio = bio;
  if (location !== undefined) user.location = location;
  if (phone !== undefined) user.phone = phone;

  console.log('Basic fields updated');

  // Update role-specific fields
  if (role === 'freelancer') {
    user.skills = skills || [];
    user.hourlyRate = hourlyRate;
    user.experience = experience;
    
    console.log('Freelancer fields set:', { 
      skillsCount: user.skills.length, 
      hourlyRate: user.hourlyRate, 
      experience: user.experience 
    });
    
    // Clear client fields by setting to undefined
    user.companyName = undefined;
    user.companySize = undefined;
    user.industry = undefined;
  } else if (role === 'client') {
    user.companyName = companyName;
    user.companySize = companySize;
    user.industry = industry;
    
    console.log('Client fields set:', { 
      companyName: user.companyName, 
      companySize: user.companySize, 
      industry: user.industry 
    });
    
    // Clear freelancer fields
    user.skills = [];
    user.hourlyRate = undefined;
    user.experience = undefined;
  }

  // Calculate profile completion status - ensure it's a boolean
  const isComplete = Boolean(user.checkProfileComplete());
  user.isProfileComplete = isComplete;

  console.log('Profile completion checked:', isComplete);

  // Save with validation
  try {
    await user.save();
    console.log('User saved successfully');
  } catch (error) {
    console.error('Error saving user:', error);
    throw new AppError(`Failed to save profile: ${error.message}`, 500);
  }

  return user;
};

/**
 * Login user with local authentication
 * @param {Object} credentials - Login credentials
 * @returns {Object} User and token
 */
export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email });
  
  if (!user || user.provider !== "local") {
    throw new AppError("Invalid credentials", 401);
  }
  
  const isPasswordValid = await bcrypt.compare(password, user.password);
  
  if (!isPasswordValid) {
    throw new AppError("Invalid credentials", 401);
  }
  
  const token = TokenService.generateToken(user);
  
  return { user, token };
};

