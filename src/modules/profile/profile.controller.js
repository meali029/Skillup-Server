import { 
  getProfile,
  updateProfile,
  updateAvatar,
  addPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem
} from "./profile.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError } from "../../core/errors/index.js";
import { UserDTO } from "../shared/dtos/index.js";

/**
 * Get user profile
 * @route GET /api/profile/:userId
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const user = await getProfile(userId);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Profile retrieved successfully"
  );
});

/**
 * Get current user profile
 * @route GET /api/profile/me
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user.id);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Profile retrieved successfully"
  );
});

/**
 * Update user profile
 * @route PUT /api/profile
 */
export const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Profile updated successfully"
  );
});

/**
 * Upload avatar
 * @route POST /api/profile/avatar
 */
export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded", 400);
  }
  
  // Construct file URL - relative path from uploads directory
  const avatarUrl = `/uploads/${req.file.filename}`;
  
  const user = await updateAvatar(req.user.id, avatarUrl);
  
  successResponse(
    res,
    { user: new UserDTO(user), avatarUrl },
    "Avatar uploaded successfully"
  );
});

/**
 * Add portfolio item
 * @route POST /api/profile/portfolio
 */
export const addPortfolio = asyncHandler(async (req, res) => {
  const user = await addPortfolioItem(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Portfolio item added successfully",
    201
  );
});

/**
 * Update portfolio item
 * @route PUT /api/profile/portfolio/:portfolioId
 */
export const updatePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await updatePortfolioItem(req.user.id, portfolioId, req.validatedData);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Portfolio item updated successfully"
  );
});

/**
 * Delete portfolio item
 * @route DELETE /api/profile/portfolio/:portfolioId
 */
export const deletePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await deletePortfolioItem(req.user.id, portfolioId);
  
  successResponse(
    res,
    { user: new UserDTO(user) },
    "Portfolio item deleted successfully"
  );
});
