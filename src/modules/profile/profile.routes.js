import express from "express";
import {
  getUserProfile,
  getMyProfile,
  updateUserProfile,
  uploadAvatar,
  uploadPortfolioImage,
  addPortfolio,
  updatePortfolio,
  deletePortfolio
} from "./profile.controller.js";
import { authenticate } from "../../core/middlewares/index.js";
import { uploadSingle, handleUploadError } from "../../core/middlewares/upload.js";
import { validateProfileUpdate, validatePortfolioItem } from "./profile.validation.js";

function createProfileRoutes() {
  const router = express.Router();

  router.get("/me", authenticate, getMyProfile);
  router.put("/", authenticate, validateProfileUpdate, updateUserProfile);
  
  router.post("/avatar", authenticate, uploadSingle("avatar"), handleUploadError, uploadAvatar);
  
  router.post("/portfolio/upload", authenticate, uploadSingle("portfolioImage"), handleUploadError, uploadPortfolioImage);
  router.post("/portfolio", authenticate, validatePortfolioItem, addPortfolio);
  router.put("/portfolio/:portfolioId", authenticate, validatePortfolioItem, updatePortfolio);
  router.delete("/portfolio/:portfolioId", authenticate, deletePortfolio);

  router.get("/:userId", getUserProfile);

  return router;
}

export default createProfileRoutes;
