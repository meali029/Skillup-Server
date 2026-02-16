import express from 'express';
import * as contractController from './contract.controller.js';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as contractValidation from './contract.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/contracts/stats/me:
 *   get:
 *     summary: Get contract statistics for current user
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contract statistics
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
 *                     active:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     totalEarnings:
 *                       type: number
 *       401:
 *         description: Not authenticated
 */
router.get('/stats/me', contractController.getMyStats);

/**
 * @swagger
 * /api/contracts/from-proposal:
 *   post:
 *     summary: Create a contract from accepted proposal
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proposalId
 *             properties:
 *               proposalId:
 *                 type: string
 *               milestones:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     dueDate:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       201:
 *         description: Contract created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Proposal not found
 */
router.post(
  '/from-proposal',
  validate(contractValidation.createFromProposal),
  contractController.createFromProposal
);

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: Get all contracts for current user
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, completed, cancelled, disputed]
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
 *         description: List of contracts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contracts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contract'
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/',
  validate(contractValidation.queryContracts),
  contractController.getMyContracts
);

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get contract by ID
 *     tags: [Contracts]
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
 *         description: Contract details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Contract not found
 */
router.get(
  '/:id',
  validate(contractValidation.getContract),
  contractController.getContract
);

/**
 * @swagger
 * /api/contracts/{id}/respond:
 *   post:
 *     summary: Accept or decline a contract (freelancer)
 *     tags: [Contracts]
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
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accept, decline]
 *               reason:
 *                 type: string
 *                 description: Required if declining
 *     responses:
 *       200:
 *         description: Contract response recorded
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post(
  '/:id/respond',
  validate(contractValidation.respondToContract),
  contractController.respondToContract
);

/**
 * @swagger
 * /api/contracts/{id}/milestones:
 *   post:
 *     summary: Add a milestone to contract
 *     tags: [Contracts]
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
 *             required:
 *               - title
 *               - amount
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Milestone added
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post(
  '/:id/milestones',
  validate(contractValidation.addMilestone),
  contractController.addMilestone
);

/**
 * @swagger
 * /api/contracts/{id}/milestones/{milestoneId}:
 *   patch:
 *     summary: Update a milestone
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed]
 *     responses:
 *       200:
 *         description: Milestone updated
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Contract or milestone not found
 */
router.patch(
  '/:id/milestones/:milestoneId',
  validate(contractValidation.updateMilestone),
  contractController.updateMilestone
);

/**
 * @swagger
 * /api/contracts/{id}/complete:
 *   post:
 *     summary: Mark contract as complete
 *     tags: [Contracts]
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
 *         description: Contract marked as complete
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post(
  '/:id/complete',
  validate(contractValidation.getContract),
  contractController.completeContract
);

/**
 * @swagger
 * /api/contracts/{id}/cancel:
 *   post:
 *     summary: Cancel a contract
 *     tags: [Contracts]
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
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract cancelled
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post(
  '/:id/cancel',
  validate(contractValidation.cancelContract),
  contractController.cancelContract
);

/**
 * @swagger
 * /api/contracts/{id}/milestones/{milestoneId}/fund:
 *   post:
 *     summary: Fund milestone escrow (client)
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Milestone funded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 escrow:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       400:
 *         description: Insufficient balance
 */
router.post(
  '/:id/milestones/:milestoneId/fund',
  validate(contractValidation.fundMilestoneEscrow),
  contractController.fundMilestoneEscrow
);

/**
 * @swagger
 * /api/contracts/{id}/milestones/{milestoneId}/approve:
 *   post:
 *     summary: Approve milestone and release escrow (client)
 *     tags: [Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Milestone approved and payment released
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/:id/milestones/:milestoneId/approve',
  validate(contractValidation.approveMilestone),
  contractController.approveMilestoneWork
);

// Milestone workflow routes
router.post(
  '/:id/milestones/:milestoneId/start',
  contractController.startMilestone
);

router.post(
  '/:id/milestones/:milestoneId/submit',
  contractController.submitMilestone
);

router.post(
  '/:id/milestones/:milestoneId/request-revision',
  contractController.requestMilestoneRevision
);

/**
 * @swagger
 * /api/contracts/{id}/verify-payment:
 *   post:
 *     summary: Verify contract payment status
 *     tags: [Contracts]
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
 *         description: Payment verification result
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Contract not found
 */
router.post(
  '/:id/verify-payment',
  contractController.verifyContractPayment
);

/**
 * @swagger
 * /api/contracts/{id}/start:
 *   post:
 *     summary: Start contract (pending → active)
 *     tags: [Contracts]
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
 *         description: Contract started successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/start', contractController.startContract);

/**
 * @swagger
 * /api/contracts/{id}/submit-work:
 *   post:
 *     summary: Submit work for review (active → in_review)
 *     tags: [Contracts]
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
 *             required:
 *               - deliverables
 *             properties:
 *               deliverables:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     fileUrl:
 *                       type: string
 *                     fileName:
 *                       type: string
 *     responses:
 *       200:
 *         description: Work submitted successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/submit-work', contractController.submitWork);

/**
 * @swagger
 * /api/contracts/{id}/approve-work:
 *   post:
 *     summary: Approve work and release payment (in_review → completed)
 *     tags: [Contracts]
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
 *         description: Work approved successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/approve-work', contractController.approveWork);

/**
 * @swagger
 * /api/contracts/{id}/request-revision:
 *   post:
 *     summary: Request revision (in_review → active)
 *     tags: [Contracts]
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
 *             required:
 *               - feedback
 *             properties:
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Revision requested successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/request-revision', contractController.requestRevision);

/**
 * @swagger
 * /api/contracts/{id}/close:
 *   post:
 *     summary: Close contract (completed → closed)
 *     tags: [Contracts]
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
 *         description: Contract closed successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/close', contractController.closeContract);

export default router;
