import User from '../../models/User.js';
import { createAppError } from '../../core/errors/index.js';

const notificationDefaults = {
  pushNotifications: true,
  messageNotifications: true,
  proposalNotifications: true,
  contractNotifications: true,
  paymentNotifications: true,
  accountNotifications: true,
  jobRecommendations: true,
};

const preferenceDefaults = {
  theme: 'system',
  allowDirectMessages: true,
};

const pickBooleanSettings = (input, defaults) => {
  return Object.keys(defaults).reduce((settings, key) => {
    settings[key] = typeof input?.[key] === 'boolean' ? input[key] : defaults[key];
    return settings;
  }, {});
};

const pickPreferences = (input = {}) => {
  const next = { ...preferenceDefaults };

  if (['system', 'light', 'dark'].includes(input.theme)) next.theme = input.theme;
  if (typeof input.allowDirectMessages === 'boolean') next.allowDirectMessages = input.allowDirectMessages;

  return next;
};

/**
 * Get user by ID (public info)
 * @param {string} userId - The user ID to fetch
 * @returns {Object} User data
 */
export const getUserById = async (userId) => {
  // Validate ObjectId format
  if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
    throw createAppError('Invalid user ID format', 400);
  }

  const user = await User.findById(userId).select('-password -resetPasswordOTP -resetPasswordOTPExpires');

  if (!user) {
    throw createAppError('User not found', 404);
  }

  // Return public user data
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    bio: user.bio,
    location: user.location,
    phone: user.phone,
    website: user.website,
    languages: user.languages,
    availability: user.availability,
    skills: user.skills,
    hourlyRate: user.hourlyRate,
    experience: user.experience,
    portfolio: user.portfolio,
    appliedJobsCount: user.appliedJobsCount,
    activeProposalsCount: user.activeProposalsCount,
    completedJobsCount: user.completedJobsCount,
    totalEarnings: user.totalEarnings,
    isActive: user.isActive,
    isBanned: user.isBanned,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

/**
 * Get all freelancers with optional filters
 * @param {Object} filters - Query filters
 * @returns {Object} Paginated freelancers data
 */
export const getFreelancers = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    skills,
    location,
    minRate,
    maxRate,
    experience,
    availability,
    search
  } = filters;

  const query = { role: 'freelancer', isActive: true, isBanned: { $ne: true } };

  // Add filters
  if (skills && skills.length > 0) {
    query.skills = { $in: skills };
  }

  if (location) {
    query.location = { $regex: location, $options: 'i' };
  }

  if (minRate || maxRate) {
    query.hourlyRate = {};
    if (minRate) query.hourlyRate.$gte = parseFloat(minRate);
    if (maxRate) query.hourlyRate.$lte = parseFloat(maxRate);
  }

  if (experience) {
    query.experience = experience;
  }

  if (availability) {
    query.availability = availability;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { bio: { $regex: search, $options: 'i' } },
      { skills: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  const skip = (page - 1) * limit;
  const sortOptions = { createdAt: -1 };

  const freelancers = await User.find(query)
    .select('-password -resetPasswordOTP -resetPasswordOTPExpires')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await User.countDocuments(query);

  return {
    freelancers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

export const updatePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (user.provider === 'google' || !user.password) {
    throw createAppError('This account uses Google sign-in. Use password reset to create a local password.', 400);
  }

  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    throw createAppError('Current password is incorrect', 400);
  }

  user.password = newPassword;
  await user.save();

  return true;
};

export const getNotificationSettings = async (userId) => {
  const user = await User.findById(userId).select('notificationSettings').lean();

  if (!user) {
    throw createAppError('User not found', 404);
  }

  return pickBooleanSettings(user.notificationSettings || {}, notificationDefaults);
};

export const updateNotificationSettings = async (userId, settings = {}) => {
  const currentSettings = await getNotificationSettings(userId);
  const notificationSettings = pickBooleanSettings(
    { ...currentSettings, ...settings },
    notificationDefaults
  );

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { notificationSettings } },
    { new: true, runValidators: true }
  ).select('notificationSettings');

  if (!user) {
    throw createAppError('User not found', 404);
  }

  return {
    ...notificationDefaults,
    ...(user.notificationSettings?.toObject?.() || user.notificationSettings || {}),
  };
};

export const getPreferences = async (userId) => {
  const user = await User.findById(userId).select('preferences').lean();

  if (!user) {
    throw createAppError('User not found', 404);
  }

  return pickPreferences(user.preferences || {});
};

export const updatePreferences = async (userId, preferences = {}) => {
  const currentPreferences = await getPreferences(userId);
  const nextPreferences = pickPreferences({ ...currentPreferences, ...preferences });

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { preferences: nextPreferences } },
    { new: true, runValidators: true }
  ).select('preferences');

  if (!user) {
    throw createAppError('User not found', 404);
  }

  return {
    ...preferenceDefaults,
    ...(user.preferences?.toObject?.() || user.preferences || {}),
  };
};
