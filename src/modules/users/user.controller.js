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