import express from "express";
import {
  getUserProfile,
  getMyProfile,
  updateUserProfile,
  uploadAvatar,
  addPortfolio,
  updatePortfolio,
  deletePortfolio
} from "./profile.controller.js";
import { authenticate } from "../../core/middlewares/index.js";
import { uploadSingle, handleUploadError } from "../../core/middlewares/upload.js";
import { validateProfileUpdate, validatePortfolioItem } from "./profile.validation.js";

/**
 * Profile Routes
 * Handles all profile-related endpoints
 */
function createProfileRoutes() {
  const router = express.Router();

  // Profile routes - IMPORTANT: /me must come before /:userId
  router.get("/me", authenticate, getMyProfile);
  router.put("/", authenticate, validateProfileUpdate, updateUserProfile);
  
  // Avatar upload with file upload middleware
  router.post("/avatar", authenticate, uploadSingle("avatar"), handleUploadError, uploadAvatar);
  
  // Portfolio routes (Freelancer only)
  router.post("/portfolio", authenticate, validatePortfolioItem, addPortfolio);
  router.put("/portfolio/:portfolioId", authenticate, validatePortfolioItem, updatePortfolio);
  router.delete("/portfolio/:portfolioId", authenticate, deletePortfolio);

  // Public profile view - must be last to avoid matching other routes
  router.get("/:userId", getUserProfile);

  return router;
}

export default createProfileRoutes;
