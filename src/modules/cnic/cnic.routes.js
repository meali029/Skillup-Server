import express from 'express';
import { authenticate, authorize } from '../../core/middlewares/index.js';
import { requirePermission } from '../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { handleCNICUpload, handleMulterError } from '../../config/multer.cloudinary.js';
import * as cnicController from './cnic.controller.js';
import * as cnicValidation from './cnic.validation.js';

const router = express.Router();

/**
 * @swagger
 * /api/cnic/submit:
 *   post:
 *     summary: Submit CNIC for verification
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - frontImage
 *               - backImage
 *             properties:
 *               frontImage:
 *                 type: string
 *                 format: binary
 *                 description: CNIC front side image
 *               backImage:
 *                 type: string
 *                 format: binary
 *                 description: CNIC back side image
 *               cnicNumber:
 *                 type: string
 *                 pattern: '^[0-9]{5}-[0-9]{7}-[0-9]$'
 *     responses:
 *       200:
 *         description: CNIC submitted for verification
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Invalid files or already submitted
 */
router.post(
  '/submit',
  authenticate,
  handleCNICUpload,
  handleMulterError,
  cnicController.submitCNIC
);

/**
 * @swagger
 * /api/cnic/status:
 *   get:
 *     summary: Get CNIC verification status
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CNIC verification status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [not_submitted, pending, verified, rejected, reupload_required]
 *                 submittedAt:
 *                   type: string
 *                   format: date-time
 *                 verifiedAt:
 *                   type: string
 *                   format: date-time
 *                 rejectionReason:
 *                   type: string
 *       401:
 *         description: Not authenticated
 */
router.get('/status', authenticate, cnicController.getMyCNICStatus);

/**
 * @swagger
 * /api/cnic/admin/stats:
 *   get:
 *     summary: Get CNIC verification statistics (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CNIC statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: integer
 *                     verified:
 *                       type: integer
 *                     rejected:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get(
  '/admin/stats',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getCNICStats
);

/**
 * @swagger
 * /api/cnic/admin/pending:
 *   get:
 *     summary: Get pending CNIC verifications (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of pending CNIC verifications
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get(
  '/admin/pending',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getPendingCNICs
);

/**
 * @swagger
 * /api/cnic/admin/{userId}:
 *   get:
 *     summary: Get CNIC details for a user (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CNIC details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: CNIC not found
 */
router.get(
  '/admin/:userId',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VIEW_CNIC),
  cnicController.getCNICDetails
);

/**
 * @swagger
 * /api/cnic/admin/{userId}/approve:
 *   put:
 *     summary: Approve CNIC verification (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: CNIC approved
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: CNIC not found
 */
router.put(
  '/admin/:userId/approve',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.VERIFY_CNIC),
  cnicValidation.validateApproveCNIC,
  cnicController.approveCNIC
);

/**
 * @swagger
 * /api/cnic/admin/{userId}/reject:
 *   put:
 *     summary: Reject CNIC verification (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: CNIC rejected
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: CNIC not found
 */
router.put(
  '/admin/:userId/reject',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.REJECT_CNIC),
  cnicValidation.validateReason,
  cnicController.rejectCNIC
);

/**
 * @swagger
 * /api/cnic/admin/{userId}/reupload:
 *   put:
 *     summary: Request CNIC reupload (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reupload requested
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: CNIC not found
 */
router.put(
  '/admin/:userId/reupload',
  authenticate,
  authorize('admin'),
  requirePermission(PERMISSIONS.REJECT_CNIC),
  cnicValidation.validateReason,
  cnicController.requestReupload
);

/**
 * @swagger
 * /api/cnic/admin/{userId}/run-ocr:
 *   post:
 *     summary: Run OCR extraction on CNIC images (Admin)
 *     tags: [CNIC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OCR extraction completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ocrData:
 *                   type: object
 *                 ocrMatchStatus:
 *                   type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: CNIC not found
 */
router.post(
  '/admin/:userId/run-ocr',
  authenticate,
  authorize('admin', 'super_admin'),
  requirePermission(PERMISSIONS.VERIFY_CNIC),
  cnicController.runOCR
);

export default router;
