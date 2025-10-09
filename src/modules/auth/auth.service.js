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

export const registerLocal = async ({ name, email, password, role, additionalData = {} }) => {
  // Validate required fields
  if (!name || !email || !password) {
    throw new Error("Name, email, and password are required");
  }

  // Validate role
  if (role && !["freelancer", "client"].includes(role)) {
    throw new Error("Invalid role. Must be 'freelancer' or 'client'");
  }

  // Check if user already exists
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
    role: role || "freelancer",
    provider: "local",
    ...additionalData
  };

  // Role-specific validations
  if (role === "client" && additionalData.companyName) {
    userData.companyName = additionalData.companyName;
    userData.companySize = additionalData.companySize;
    userData.industry = additionalData.industry;
  }

  if (role === "freelancer") {
    userData.skills = additionalData.skills || [];
    userData.experience = additionalData.experience;
    userData.hourlyRate = additionalData.hourlyRate;
  }

  // Create user
  const user = await User.create(userData);
  const token = createToken(user);
  
  return { user, token };
};

export const loginLocal = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user || user.provider !== "local") throw new Error("Invalid credentials");
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new Error("Invalid credentials");
  const token = createToken(user);
  return { user, token };
};
