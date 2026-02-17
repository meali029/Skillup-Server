import express from 'express';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import {
  uploadDeliverable,
  uploadAvatar,
  deleteFile,
  uploadMiddleware,
} from './upload.controller.js';

const router = express.Router();

/**
 * @route   POST /api/uploads/deliverable
 * @desc    Upload deliverable file (PDF, image, document, etc.)
 * @access  Private
 */
router.post('/deliverable', authenticate, uploadMiddleware, uploadDeliverable);

/**
 * @route   POST /api/uploads/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/avatar', authenticate, uploadMiddleware, uploadAvatar);

/**
 * @route   DELETE /api/uploads/:publicId
 * @desc    Delete uploaded file from Cloudinary
 * @access  Private
 */
router.delete('/:publicId', authenticate, deleteFile);

export default router;
