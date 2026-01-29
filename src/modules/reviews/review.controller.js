import reviewService from './review.service.js';
import asyncHandler from '../../core/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../core/utils/responseFormatter.js';

/**
 * @desc    Submit a review for a completed contract
 * @route   POST /api/reviews/contracts/:contractId
 * @access  Private (Contract parties only)
 * 
 * Business Rules:
 * - Contract must be COMPLETED
 * - Only client or freelancer of the contract can review
 * - Each party can only submit ONE review per contract
 */
export const submitReview = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const { rating, comment } = req.body;
  const reviewerId = req.user.id;

  const result = await reviewService.submitReview(
    contractId,
    reviewerId,
    { rating, comment }
  );

  successResponse(
    res,
    result,
    'Review submitted successfully',
    201
  );
});

/**
 * @desc    Get review status for a contract
 * @route   GET /api/reviews/contracts/:contractId/status
 * @access  Private (Contract parties only)
 * 
 * Returns whether the user has reviewed and whether the other party has reviewed
 */
export const getReviewStatus = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const userId = req.user.id;

  const status = await reviewService.getReviewStatus(contractId, userId);

  successResponse(
    res,
    status,
    'Review status retrieved successfully'
  );
});

/**
 * @desc    Get all reviews for a contract
 * @route   GET /api/reviews/contracts/:contractId
 * @access  Public (for transparency)
 */
export const getContractReviews = asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  const reviews = await reviewService.getContractReviews(contractId);

  successResponse(
    res,
    reviews,
    'Contract reviews retrieved successfully'
  );
});

/**
 * @desc    Get all reviews received by a user
 * @route   GET /api/reviews/users/:userId
 * @access  Public (for transparency on user profiles)
 * 
 * Supports pagination and sorting
 */
export const getUserReviews = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page, limit, sort } = req.query;

  const result = await reviewService.getUserReviews(userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
    sort: sort || 'recent',
  });

  paginatedResponse(
    res,
    result.reviews,
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total,
    'User reviews retrieved successfully',
    { user: result.user }
  );
});

/**
 * @desc    Get my reviews (logged-in user)
 * @route   GET /api/reviews/me
 * @access  Private
 */
export const getMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, sort } = req.query;

  const result = await reviewService.getUserReviews(userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
    sort: sort || 'recent',
  });

  paginatedResponse(
    res,
    result.reviews,
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total,
    'Your reviews retrieved successfully',
    { user: result.user }
  );
});
