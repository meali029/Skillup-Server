import { 
  getProfile,
  updateProfile,
  updateAvatar,
  addPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem
} from "./profile.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError, createAppError } from "../../core/errors/index.js";
import { formatUser } from "../shared/dtos/index.js";
import path from "path";

export const getUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const user = await getProfile(userId);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile retrieved successfully"
  );
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user.id);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile retrieved successfully"
  );
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile updated successfully"
  );
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw AppError("No file uploaded", 400);
  }
  
  const avatarUrl = `/uploads/${req.file.filename}`;
  
  const user = await updateAvatar(req.user.id, avatarUrl);
  
  successResponse(
    res,
    { user: formatUser(user), avatarUrl },
    "Avatar uploaded successfully"
  );
});

export const uploadPortfolioImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw AppError("No file uploaded", 400);
  }
  
  const imageUrl = `/uploads/${req.file.filename}`;
  
  successResponse(
    res,
    { imageUrl },
    "Portfolio image uploaded successfully"
  );
});

export const addPortfolio = asyncHandler(async (req, res) => {
  const user = await addPortfolioItem(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item added successfully",
    201
  );
});

export const updatePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await updatePortfolioItem(req.user.id, portfolioId, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item updated successfully"
  );
});

export const deletePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await deletePortfolioItem(req.user.id, portfolioId);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item deleted successfully"
  );
});
