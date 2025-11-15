import User from "../../models/User.js";
import { AppError } from "../../core/errors/index.js";

/**
 * Get user profile by ID
 */
export const getProfile = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  return user;
};

/**
 * Update user profile
 */
export const updateProfile = async (userId, updateData) => {
  const allowedFields = [
    'name', 'bio', 'location', 'phone', 'website',
    'skills', 'hourlyRate', 'experience',
    'companyName', 'companySize', 'industry',
    'languages', 'availability'
  ];
  
  // Filter only allowed fields
  const filteredData = {};
  Object.keys(updateData).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredData[key] = updateData[key];
    }
  });
  
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: filteredData },
    { new: true, runValidators: true }
  );
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  return user;
};

/**
 * Update avatar
 */
export const updateAvatar = async (userId, avatarUrl) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { avatar: avatarUrl },
    { new: true }
  );
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  return user;
};

/**
 * Add portfolio item (Freelancer only)
 */
export const addPortfolioItem = async (userId, portfolioData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  if (user.role !== 'freelancer') {
    throw new AppError("Only freelancers can add portfolio items", 403);
  }
  
  user.portfolio.push(portfolioData);
  await user.save();
  
  return user;
};

/**
 * Update portfolio item
 */
export const updatePortfolioItem = async (userId, portfolioId, updateData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  const portfolioItem = user.portfolio.id(portfolioId);
  
  if (!portfolioItem) {
    throw new AppError("Portfolio item not found", 404);
  }
  
  Object.assign(portfolioItem, updateData);
  await user.save();
  
  return user;
};

/**
 * Delete portfolio item
 */
export const deletePortfolioItem = async (userId, portfolioId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError("User not found", 404);
  }
  
  user.portfolio.pull(portfolioId);
  await user.save();
  
  return user;
};
