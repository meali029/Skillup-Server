import express from 'express';
import * as reviewController from './review.controller.js';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as reviewValidation from './review.validation.js';

const router = express.Router();

/**
 * Review Routes
 * 
 * Public Routes:
 * - GET /api/reviews/users/:userId - Get reviews received by a user
 * - GET /api/reviews/contracts/:contractId - Get reviews for a contract
 * 
 * Private Routes (require authentication):
 * - POST /api/reviews/contracts/:contractId - Submit a review
 * - GET /api/reviews/contracts/:contractId/status - Get review status
 * - GET /api/reviews/me - Get logged-in user's reviews
 */

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all reviews received by a user (public for profile transparency)
router.get(
  '/users/:userId',
  validate(reviewValidation.getUserReviews),
  reviewController.getUserReviews
);

// Get reviews for a contract (public)
router.get(
  '/contracts/:contractId',
  validate(reviewValidation.getReviewStatus),
  reviewController.getContractReviews
);

// ============================================
// PRIVATE ROUTES (require authentication)
// ============================================
router.use(authenticate);

// Get my reviews (logged-in user)
router.get('/me', reviewController.getMyReviews);

// Get review status for a contract (can I review? have I reviewed?)
router.get(
  '/contracts/:contractId/status',
  validate(reviewValidation.getReviewStatus),
  reviewController.getReviewStatus
);

// Submit a review for a completed contract
router.post(
  '/contracts/:contractId',
  validate(reviewValidation.submitReview),
  reviewController.submitReview
);

// Recalculate user rating (utility endpoint)
router.post(
  '/users/:userId/recalculate',
  reviewController.recalculateRating
);

export default router;
