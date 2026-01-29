/**
 * Reviews Module
 * 
 * Handles rating and review functionality for completed contracts.
 * 
 * Business Logic:
 * - Clients review freelancers after contract completion
 * - Freelancers review clients after contract completion
 * - Each party can submit only ONE review per contract (immutable)
 * - Reviews automatically update user's aggregate rating
 * 
 * API Endpoints:
 * - POST /api/reviews/contracts/:contractId - Submit a review
 * - GET /api/reviews/contracts/:contractId/status - Get review status
 * - GET /api/reviews/contracts/:contractId - Get contract reviews (public)
 * - GET /api/reviews/users/:userId - Get user reviews (public)
 * - GET /api/reviews/me - Get my reviews (authenticated)
 */

export { default as reviewRoutes } from './review.routes.js';
export { default as reviewService } from './review.service.js';
export * as reviewController from './review.controller.js';
export * as reviewValidation from './review.validation.js';
