import * as userService from './user.service.js';
import { asyncHandler, successResponse, paginatedResponse } from '../../core/utils/index.js';

/**
 * @desc    Get freelancer by ID
 * @route   GET /api/users/freelancers/:id
 * @access  Public
 */
export const getFreelancerById = asyncHandler(async (req, res) => {
  const freelancer = await userService.getFreelancerById(req.params.id);
  successResponse(res, { freelancer }, 'Freelancer retrieved successfully');
});

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Public
 */
export const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  successResponse(res, { user }, 'User retrieved successfully');
});

/**
 * @desc    Get all freelancers
 * @route   GET /api/users/freelancers
 * @access  Public
 */
export const getFreelancers = asyncHandler(async (req, res) => {
  const { page, limit, skills, location, minRate, maxRate, experience, availability, search } = req.query;

  const result = await userService.getFreelancers({
    page,
    limit,
    skills: skills ? skills.split(',') : undefined,
    location,
    minRate,
    maxRate,
    experience,
    availability,
    search
  });

  paginatedResponse(
    res,
    result.freelancers,
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

/**
 * @desc    Update current user's password
 * @route   PUT /api/users/profile/password
 * @access  Private
 */
export const updatePassword = asyncHandler(async (req, res) => {
  await userService.updatePassword(req.user.id, req.body);
  successResponse(res, null, 'Password updated successfully');
});

/**
 * @desc    Get current user's notification settings
 * @route   GET /api/users/settings/notifications
 * @access  Private
 */
export const getNotificationSettings = asyncHandler(async (req, res) => {
  const notificationSettings = await userService.getNotificationSettings(req.user.id);
  successResponse(res, { notificationSettings }, 'Notification settings retrieved successfully');
});

/**
 * @desc    Update current user's notification settings
 * @route   PUT /api/users/settings/notifications
 * @access  Private
 */
export const updateNotificationSettings = asyncHandler(async (req, res) => {
  const notificationSettings = await userService.updateNotificationSettings(req.user.id, req.body);
  successResponse(res, { notificationSettings }, 'Notification settings updated successfully');
});

/**
 * @desc    Get current user's workspace preferences
 * @route   GET /api/users/preferences
 * @access  Private
 */
export const getPreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.getPreferences(req.user.id);
  successResponse(res, { preferences }, 'Preferences retrieved successfully');
});

/**
 * @desc    Update current user's workspace preferences
 * @route   PUT /api/users/preferences
 * @access  Private
 */
export const updatePreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.updatePreferences(req.user.id, req.body);
  successResponse(res, { preferences }, 'Preferences updated successfully');
});
