import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const createToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

export const registerLocal = async ({ name, email, password, role }) => {
  // Joi validation already done in middleware, just check for existing user
  const exists = await User.findOne({ email });
  if (exists) throw new Error("Email already registered");

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
  
  const token = createToken(user);
  
  return { user, token };
};

export const completeProfile = async (userId, profileData) => {
  const { role, bio, location, phone, skills, hourlyRate, experience, companyName, companySize, industry } = profileData;

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Validate role
  if (!role || !['freelancer', 'client'].includes(role)) {
    throw new Error('Valid role (freelancer or client) is required');
  }

  // Update basic fields
  user.role = role;
  if (bio !== undefined) user.bio = bio;
  if (location !== undefined) user.location = location;
  if (phone !== undefined) user.phone = phone;

  // Update role-specific fields
  if (role === 'freelancer') {
    user.skills = skills || [];
    user.hourlyRate = hourlyRate;
    user.experience = experience;
    
    // Clear client fields by setting to undefined
    user.companyName = undefined;
    user.companySize = undefined;
    user.industry = undefined;
  } else if (role === 'client') {
    user.companyName = companyName;
    user.companySize = companySize;
    user.industry = industry;
    
    // Clear freelancer fields
    user.skills = [];
    user.hourlyRate = undefined;
    user.experience = undefined;
  }

  // Calculate profile completion status - ensure it's a boolean
  const isComplete = Boolean(user.checkProfileComplete());
  user.isProfileComplete = isComplete;

  // Save with validation
  await user.save();

  return user;
};

export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user || user.provider !== "local") throw new Error("Invalid credentials");
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new Error("Invalid credentials");
  const token = createToken(user);
  return { user, token };
};
