import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { AppError } from "../../core/errors/index.js";
import { TokenService } from "../shared/services/index.js";

export const registerLocal = async ({ name, email, password, role }) => {
  const exists = await User.findOne({ email });
  if (exists) {
    throw new AppError("Email already registered", 400);
  }

  const userData = {
    name,
    email,
    password,
    role: role || undefined,
    provider: "local"
  };

  const user = await User.create(userData);
  
  const isComplete = Boolean(user.checkProfileComplete());
  if (user.isProfileComplete !== isComplete) {
    user.isProfileComplete = isComplete;
    await user.save();
  }
  
  const token = TokenService.generateToken(user);
  
  return { user, token };
};

export const completeProfile = async (userId, profileData) => {
  const { role, bio, location, phone, skills, hourlyRate, experience, companyName, companySize, industry } = profileData;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!role || !['freelancer', 'client'].includes(role)) {
    throw new AppError('Valid role (freelancer or client) is required', 400);
  }

  user.role = role;
  if (bio !== undefined) user.bio = bio;
  if (location !== undefined) user.location = location;
  if (phone !== undefined) user.phone = phone;

  if (role === 'freelancer') {
    user.skills = skills || [];
    user.hourlyRate = hourlyRate;
    user.experience = experience;
    
    user.companyName = undefined;
    user.companySize = undefined;
    user.industry = undefined;
  } else if (role === 'client') {
    user.companyName = companyName;
    user.companySize = companySize;
    user.industry = industry;
    
    user.skills = [];
    user.hourlyRate = undefined;
    user.experience = undefined;
  }

  const isComplete = Boolean(user.checkProfileComplete());
  user.isProfileComplete = isComplete;

  await user.save();

  return user;
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
  
  const token = TokenService.generateToken(user);
  
  return { user, token };
};

