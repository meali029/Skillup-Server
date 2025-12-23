import { asyncHandler, successResponse } from '../../../core/utils/index.js';
import envService from '../../../services/env/env.service.js';
import { refreshEnvFromDatabase } from '../../../core/utils/envLoader.js';
import createAppError from '../../../core/errors/AppError.js';

const AppError = createAppError;

/**
 * Get all environment variables
 */
export const getEnvVars = asyncHandler(async (req, res) => {
  const variables = await envService.getAllVariables();
  
  // Don't expose sensitive values in list view
  const sanitized = variables.map((v) => ({
    _id: v._id,
    key: v.key,
    value: v.isEncrypted ? '***ENCRYPTED***' : v.value,
    description: v.description,
    category: v.category,
    isEncrypted: v.isEncrypted,
    isPublic: v.isPublic,
    updatedBy: v.updatedBy,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }));

  successResponse(res, { variables: sanitized }, 'Environment variables retrieved successfully');
});

/**
 * Get a single environment variable
 */
export const getEnvVar = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const variable = await envService.getVariable(key);

  if (!variable) {
    throw AppError('Environment variable not found', 404);
  }

  // Don't expose encrypted values
  const sanitized = {
    ...variable.toObject(),
    value: variable.isEncrypted ? '***ENCRYPTED***' : variable.value,
  };

  successResponse(res, { variable: sanitized }, 'Environment variable retrieved successfully');
});

/**
 * Create or update an environment variable
 */
export const setEnvVar = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { key, value, description, category, isEncrypted, isPublic } = req.body;

  if (!key || value === undefined) {
    throw AppError('Key and value are required', 400);
  }

  const options = {
    description: description || '',
    category: category || 'other',
    isEncrypted: isEncrypted || false,
    isPublic: isPublic || false,
  };

  const variable = await envService.setVariable(key, value, options, adminId);

  // Refresh environment cache
  await refreshEnvFromDatabase();

  successResponse(res, { variable }, 'Environment variable saved successfully');
});

/**
 * Delete an environment variable
 */
export const deleteEnvVar = asyncHandler(async (req, res) => {
  const { key } = req.params;
  
  await envService.deleteVariable(key);

  // Refresh environment cache
  await refreshEnvFromDatabase();

  successResponse(res, {}, 'Environment variable deleted successfully');
});

/**
 * Bulk set environment variables
 */
export const setBulkEnvVars = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { variables } = req.body;

  if (!Array.isArray(variables) || variables.length === 0) {
    throw AppError('Variables array is required', 400);
  }

  const results = await envService.setBulkVariables(variables, adminId);

  // Refresh environment cache
  await refreshEnvFromDatabase();

  successResponse(res, { variables: results }, 'Environment variables saved successfully');
});

/**
 * Get public environment variables (for frontend)
 */
export const getPublicEnvVars = asyncHandler(async (req, res) => {
  const variables = await envService.getPublicVariables();
  successResponse(res, { variables }, 'Public environment variables retrieved successfully');
});

