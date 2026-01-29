import User from "../../models/User.js";
import { AppError, createAppError } from "../../core/errors/index.js";

// Profile Completeness Configuration
const FREELANCER_FIELDS = [
  { field: 'name', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'avatar', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'bio', check: (v) => typeof v === 'string' && v.trim().length >= 50 },
  { field: 'location', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'phone', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'skills', check: (v) => Array.isArray(v) && v.length >= 3 },
  { field: 'hourlyRate', check: (v) => typeof v === 'number' && v > 0 },
  { field: 'experience', check: (v) => typeof v === 'string' && ['beginner', 'intermediate', 'expert'].includes(v) },
  { field: 'languages', check: (v) => Array.isArray(v) && v.length >= 1 },
  { field: 'portfolio', check: (v) => Array.isArray(v) && v.length >= 1 },
];

const CLIENT_FIELDS = [
  { field: 'name', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'avatar', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'bio', check: (v) => typeof v === 'string' && v.trim().length >= 30 },
  { field: 'location', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'companyName', check: (v) => typeof v === 'string' && v.trim().length > 0 },
  { field: 'companySize', check: (v) => typeof v === 'string' && ['1-10', '11-50', '51-200', '201-500', '500+'].includes(v) },
  { field: 'industry', check: (v) => typeof v === 'string' && v.trim().length > 0 },
];

/**
 * Calculate profile completeness percentage for a user
 * 
 * @param {Object} user - The user document
 * @returns {Object|null} Completeness data or null for admin/undefined role
 */
export const calculateProfileCompleteness = (user) => {
  if (!user || !user.role || user.role === 'admin') {
    return null;
  }

  const fields = user.role === 'freelancer' ? FREELANCER_FIELDS : CLIENT_FIELDS;
  const totalFields = fields.length;
  
  const filledFields = [];
  const missingFields = [];

  fields.forEach(({ field, check }) => {
    const value = user[field];
    if (check(value)) {
      filledFields.push(field);
    } else {
      missingFields.push(field);
    }
  });

  const filledCount = filledFields.length;
  const percentage = Math.round((filledCount / totalFields) * 100);

  return {
    percentage,
    filledFields: filledCount,
    totalFields,
    missingFields,
  };
};

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
