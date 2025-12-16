import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../core/middlewares/index.js';
import { requirePermission } from '../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { uploadCNIC } from '../../config/multer.js';
import * as cnicController from './cnic.controller.js';
import * as cnicValidation from './cnic.validation.js';

const router = express.Router();

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size is too large. Maximum size is 5MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed',
    });
  }
  next();
};

// User routes - Protected
router.post(
  '/submit',
  authenticate,
  uploadCNIC.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 },
  ]),
  handleMulterError,
  cnicController.submitCNIC
);

router.get('/status', authenticate, cnicController.getMyCNICStatus);

// Admin routes - Protected with permissions
router.get(
  '/admin/stats',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getCNICStats
);

router.get(
  '/admin/pending',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getPendingCNICs
);

router.get(
  '/admin/:userId',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getCNICDetails
);

router.put(
  '/admin/:userId/approve',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VERIFY_CNIC),
  cnicValidation.validateApproveCNIC,
  cnicController.approveCNIC
);

router.put(
  '/admin/:userId/reject',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.REJECT_CNIC),
  cnicValidation.validateReason,
  cnicController.rejectCNIC
);

router.put(
  '/admin/:userId/reupload',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.REJECT_CNIC),
  cnicValidation.validateReason,
  cnicController.requestReupload
);

export default router;
