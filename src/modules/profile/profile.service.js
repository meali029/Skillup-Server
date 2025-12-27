import User from "../../models/User.js";
import { AppError, createAppError } from "../../core/errors/index.js";

export const getProfile = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw AppError("User not found", 404);
  }
  
  return user;
};

export const updateProfile = async (userId, updateData) => {
  const allowedFields = [
    'name', 'bio', 'location', 'phone', 'website',
    'skills', 'hourlyRate', 'experience',
    'companyName', 'companySize', 'industry',
    'languages', 'availability'
  ];
  
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
    throw AppError("User not found", 404);
  }
  
  return user;
};

export const updateAvatar = async (userId, avatarUrl) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { avatar: avatarUrl },
    { new: true }
  );
  
  if (!user) {
    throw AppError("User not found", 404);
  }
  
  return user;
};

export const addPortfolioItem = async (userId, portfolioData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw AppError("User not found", 404);
  }
  
  if (user.role !== 'freelancer') {
    throw createAppError("Only freelancers can add portfolio items", 403);
  }
  
  user.portfolio.push(portfolioData);
  await user.save();
  
  return user;
};

export const updatePortfolioItem = async (userId, portfolioId, updateData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw AppError("User not found", 404);
  }
  
  const portfolioItem = user.portfolio.id(portfolioId);
  
  if (!portfolioItem) {
    throw createAppError("Portfolio item not found", 404);
  }
  
  Object.assign(portfolioItem, updateData);
  await user.save();
  
  return user;
};

export const deletePortfolioItem = async (userId, portfolioId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw AppError("User not found", 404);
  }
  
  user.portfolio.pull(portfolioId);
  await user.save();
  
  return user;
};

export const getFreelancerProfile = async (userId) => {
  const user = await User.findById(userId).select('-password');
  
  if (!user) {
    throw AppError('User not found', 404);
  }

  if (user.role !== 'freelancer') {
    throw AppError('User is not a freelancer', 403);
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    location: user.location,
    phone: user.phone,
    skills: user.skills || [],
    hourlyRate: user.hourlyRate,
    experience: user.experience,
    portfolio: user.portfolio || [],
    isProfileComplete: user.isProfileComplete,
    stats: {
      totalProposals: 0,
      ongoingProjects: 0,
      averageRating: 0
    }
  };
};
