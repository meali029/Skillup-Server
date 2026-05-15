import express from "express";
import {
  submitProposal,
  getMyProposals,
  getProposalDetails,
  updateProposal,
  withdrawProposal,
  getProposalStats,
  checkIfApplied,
  getJobProposals,
  getClientProposalDetails,
  acceptProposal,
  rejectProposal,
  getAllClientProposals,
  generateProposalDraft,
  regenerateProposalDraft,
  getProposalLimitStatus,
} from "./proposal.controller.js";
import {
  validateSubmitProposal,
  validateUpdateProposal,
  validateProposalId,
  validateJobId,
  validateProposalQuery,
  validateRejectProposal,
} from "./proposal.validation.js";
import { authenticate, authorize, aiRateLimit, checkPlanLimit } from "../../core/middlewares/index.js";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /api/proposals/limit-status:
 *   get:
 *     summary: Get weekly proposal limit status for freelancer
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Proposal limit status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 limitStatus:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     used:
 *                       type: integer
 *                       example: 15
 *                     remaining:
 *                       type: integer
 *                       example: 5
 *                     windowDays:
 *                       type: integer
 *                       example: 7
 *                     resetsAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     canSubmit:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 */
router.get("/limit-status", authorize("freelancer"), getProposalLimitStatus);

/**
 * @swagger
 * /api/proposals:
 *   post:
 *     summary: Submit a proposal for a job
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - job
 *               - coverLetter
 *               - bidAmount
 *             properties:
 *               job:
 *                 type: string
 *                 description: Job ID
 *               coverLetter:
 *                 type: string
 *               bidAmount:
 *                 type: number
 *               estimatedDuration:
 *                 type: string
 *               milestones:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     duration:
 *                       type: string
 *     responses:
 *       201:
 *         description: Proposal submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 proposal:
 *                   $ref: '#/components/schemas/Proposal'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 *       400:
 *         description: Validation error or already applied
 */
router.post("/", authorize("freelancer"), checkPlanLimit('proposals'), validateSubmitProposal, submitProposal);

/**
 * @swagger
 * /api/proposals/me:
 *   get:
 *     summary: Get all proposals submitted by the freelancer
 *     tags: [Proposals]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected, withdrawn]
 *     responses:
 *       200:
 *         description: List of proposals
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 */
router.get("/me", authorize("freelancer"), validateProposalQuery, getMyProposals);

/**
 * @swagger
 * /api/proposals/stats:
 *   get:
 *     summary: Get proposal statistics for the freelancer
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Proposal statistics
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
 *                     total:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     accepted:
 *                       type: integer
 *                     rejected:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 */
router.get("/stats", authorize("freelancer"), getProposalStats);

/**
 * @swagger
 * /api/proposals/check/{jobId}:
 *   get:
 *     summary: Check if freelancer has already applied to a job
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 hasApplied:
 *                   type: boolean
 *                 proposal:
 *                   $ref: '#/components/schemas/Proposal'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 */
router.get("/check/:jobId", authorize("freelancer"), validateJobId, checkIfApplied);

/**
 * @swagger
 * /api/proposals/freelancer/{id}:
 *   get:
 *     summary: Get proposal details for freelancer
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proposal details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Proposal not found
 */
router.get("/freelancer/:id", authorize("freelancer"), validateProposalId, getProposalDetails);

/**
 * @swagger
 * /api/proposals/{id}:
 *   put:
 *     summary: Update a proposal
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               coverLetter:
 *                 type: string
 *               bidAmount:
 *                 type: number
 *               estimatedDuration:
 *                 type: string
 *     responses:
 *       200:
 *         description: Proposal updated successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Proposal not found
 */
router.put("/:id", authorize("freelancer"), validateProposalId, validateUpdateProposal, updateProposal);

/**
 * @swagger
 * /api/proposals/{id}:
 *   delete:
 *     summary: Withdraw a proposal
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proposal withdrawn successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Proposal not found
 */
router.delete("/:id", authorize("freelancer"), validateProposalId, withdrawProposal);

/**
 * @swagger
 * /api/proposals/draft/{jobId}:
 *   get:
 *     summary: Generate AI proposal draft for a job
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI-generated proposal draft
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 draft:
 *                   type: object
 *                   properties:
 *                     coverLetter:
 *                       type: string
 *                     suggestedBid:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       429:
 *         description: Rate limit exceeded
 */
router.get("/draft/:jobId", authorize("freelancer", "admin"), validateJobId, checkPlanLimit('aiRequests'), aiRateLimit("proposal", { skipAdmin: true }), generateProposalDraft);

/**
 * @swagger
 * /api/proposals/draft/{jobId}/regenerate:
 *   post:
 *     summary: Regenerate AI proposal draft with feedback
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Regenerated proposal draft
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/draft/:jobId/regenerate", authorize("freelancer", "admin"), validateJobId, checkPlanLimit('aiRequests'), aiRateLimit("proposal", { skipAdmin: true }), regenerateProposalDraft);

/**
 * @swagger
 * /api/proposals/client/all:
 *   get:
 *     summary: Get all proposals received by client for their jobs
 *     tags: [Proposals]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of proposals
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 */
router.get("/client/all", authorize("client"), validateProposalQuery, getAllClientProposals);

/**
 * @swagger
 * /api/proposals/job/{jobId}:
 *   get:
 *     summary: Get all proposals for a specific job
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of proposals for the job
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (job owner only)
 */
router.get("/job/:jobId", authorize("client"), validateJobId, getJobProposals);

/**
 * @swagger
 * /api/proposals/client/{id}:
 *   get:
 *     summary: Get proposal details for client
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proposal details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Proposal not found
 */
router.get("/client/:id", authorize("client"), validateProposalId, getClientProposalDetails);

/**
 * @swagger
 * /api/proposals/{id}/accept:
 *   post:
 *     summary: Accept a proposal
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proposal accepted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       404:
 *         description: Proposal not found
 */
router.post("/:id/accept", authorize("client"), validateProposalId, acceptProposal);

/**
 * @swagger
 * /api/proposals/{id}/reject:
 *   post:
 *     summary: Reject a proposal
 *     tags: [Proposals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Proposal rejected successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       404:
 *         description: Proposal not found
 */
router.post("/:id/reject", authorize("client"), validateProposalId, validateRejectProposal, rejectProposal);

export default router;
