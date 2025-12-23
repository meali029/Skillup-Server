import { asyncHandler, successResponse } from '../../core/utils/index.js';
import adminSettingsService from './admin.settings.service.js';
import aiService from '../../services/ai/ai.service.js';
import createAppError from '../../core/errors/AppError.js';

const AppError = createAppError;

/**
 * Get admin settings
 */
export const getAdminSettings = asyncHandler(async (req, res) => {
  const settings = await adminSettingsService.getSettings();
  successResponse(res, { settings }, 'Admin settings retrieved successfully');
});

/**
 * Update admin settings
 */
export const updateAdminSettings = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const updates = req.body;

  // Validate that user is admin
  if (req.user.role !== 'admin') {
    throw AppError('Only admins can update settings', 403);
  }

  const settings = await adminSettingsService.updateSettings(updates, adminId);
  successResponse(res, { settings }, 'Admin settings updated successfully');
});

/**
 * Get AI feature status
 */
export const getAIFeatureStatus = asyncHandler(async (req, res) => {
  const settings = await adminSettingsService.getSettings();
  
  successResponse(res, {
    aiEnabled: settings.aiEnabled,
    features: {
      jobRecommendations: settings.aiJobRecommendations,
      freelancerRecommendations: settings.aiFreelancerRecommendations,
      proposalGeneration: settings.aiProposalGeneration,
      matchScoreEnhancement: settings.aiMatchScoreEnhancement,
    },
    provider: settings.aiProvider,
  }, 'AI feature status retrieved successfully');
});

/**
 * Get AI health stats (admin only)
 */
export const getAIHealthStats = asyncHandler(async (req, res) => {
  const healthStats = aiService.getHealthStats();
  successResponse(res, healthStats, 'AI health stats retrieved successfully');
});

/**
 * Reset AI circuit breaker (admin only)
 */
export const resetAICircuitBreaker = asyncHandler(async (req, res) => {
  aiService.resetCircuitBreaker();
  successResponse(res, { reset: true }, 'AI circuit breaker reset successfully');
});

