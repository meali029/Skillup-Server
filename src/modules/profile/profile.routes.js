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
import { uploadSingle, uploadAvatarSingle, uploadPortfolioSingle, handleUploadError } from "../../core/middlewares/upload.js";
import { validateProfileUpdate, validatePortfolioItem } from "./profile.validation.js";

function createProfileRoutes() {
  const router = express.Router();

  /**
   * @swagger
   * /api/profile/me:
   *   get:
   *     summary: Get current user's profile
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User profile data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 profile:
   *                   type: object
   *       401:
   *         description: Not authenticated
   */
  router.get("/me", authenticate, getMyProfile);

  /**
   * @swagger
   * /api/profile:
   *   put:
   *     summary: Update user profile
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               bio:
   *                 type: string
   *               title:
   *                 type: string
   *               skills:
   *                 type: array
   *                 items:
   *                   type: string
   *               hourlyRate:
   *                 type: number
   *               location:
   *                 type: object
   *                 properties:
   *                   city:
   *                     type: string
   *                   province:
   *                     type: string
   *               phone:
   *                 type: string
   *               socialLinks:
   *                 type: object
   *                 properties:
   *                   linkedin:
   *                     type: string
   *                   github:
   *                     type: string
   *                   website:
   *                     type: string
   *     responses:
   *       200:
   *         description: Profile updated successfully
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Validation error
   */
  router.put("/", authenticate, validateProfileUpdate, updateUserProfile);
  
  /**
   * @swagger
   * /api/profile/avatar:
   *   post:
   *     summary: Upload profile avatar
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               avatar:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Avatar uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 avatarUrl:
   *                   type: string
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Invalid file
   */
  router.post("/avatar", authenticate, uploadAvatarSingle(), handleUploadError, uploadAvatar);
  
  /**
   * @swagger
   * /api/profile/portfolio/upload:
   *   post:
   *     summary: Upload portfolio image
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               portfolioImage:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Portfolio image uploaded
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 imageUrl:
   *                   type: string
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Invalid file
   */
  router.post("/portfolio/upload", authenticate, uploadPortfolioSingle("portfolioImage"), handleUploadError, uploadPortfolioImage);

  /**
   * @swagger
   * /api/profile/portfolio:
   *   post:
   *     summary: Add portfolio item
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *               - description
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               imageUrl:
   *                 type: string
   *               projectUrl:
   *                 type: string
   *               technologies:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Portfolio item added
   *       401:
   *         description: Not authenticated
   *       400:
   *         description: Validation error
   */
  router.post("/portfolio", authenticate, validatePortfolioItem, addPortfolio);

  /**
   * @swagger
   * /api/profile/portfolio/{portfolioId}:
   *   put:
   *     summary: Update portfolio item
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: portfolioId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               imageUrl:
   *                 type: string
   *               projectUrl:
   *                 type: string
   *               technologies:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Portfolio item updated
   *       401:
   *         description: Not authenticated
   *       404:
   *         description: Portfolio item not found
   */
  router.put("/portfolio/:portfolioId", authenticate, validatePortfolioItem, updatePortfolio);

  /**
   * @swagger
   * /api/profile/portfolio/{portfolioId}:
   *   delete:
   *     summary: Delete portfolio item
   *     tags: [Profile]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: portfolioId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Portfolio item deleted
   *       401:
   *         description: Not authenticated
   *       404:
   *         description: Portfolio item not found
   */
  router.delete("/portfolio/:portfolioId", authenticate, deletePortfolio);

  /**
   * @swagger
   * /api/profile/{userId}:
   *   get:
   *     summary: Get user profile by ID (public)
   *     tags: [Profile]
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: User profile
   *       404:
   *         description: User not found
   */
  router.get("/:userId", getUserProfile);

  return router;
}

export default createProfileRoutes;
