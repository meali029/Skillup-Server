import express from 'express';
import {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getMyJobs,
  closeJob,
  getJobStats,
  getRecommendedJobs,
  getRecommendedFreelancers,
} from './job.controller.js';
import {
  validateCreateJob,
  validateUpdateJob,
  validateJobQuery,
} from './job.validation.js';
import { authenticate, authorize, aiRateLimit } from '../../core/middlewares/index.js';

const router = express.Router();

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Get all jobs with filters
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated list of skills
 *       - in: query
 *         name: minBudget
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxBudget
 *         schema:
 *           type: number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, completed, closed]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, budget, title]
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/', validateJobQuery, getAllJobs);

router.use(authenticate);

/**
 * @swagger
 * /api/jobs/client/my-jobs:
 *   get:
 *     summary: Get jobs posted by the authenticated client
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, completed, closed]
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
 *         description: Client's jobs
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 */
router.get('/client/my-jobs', authorize('client'), getMyJobs);

/**
 * @swagger
 * /api/jobs/client/stats:
 *   get:
 *     summary: Get job statistics for the authenticated client
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job statistics
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
 *                     totalJobs:
 *                       type: integer
 *                     openJobs:
 *                       type: integer
 *                     inProgressJobs:
 *                       type: integer
 *                     completedJobs:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 */
router.get('/client/stats', authorize('client'), getJobStats);

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Create a new job posting
 *     tags: [Jobs]
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
 *               - budget
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               budget:
 *                 type: number
 *               category:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               duration:
 *                 type: string
 *               experienceLevel:
 *                 type: string
 *                 enum: [entry, intermediate, expert]
 *               location:
 *                 type: object
 *                 properties:
 *                   city:
 *                     type: string
 *                   province:
 *                     type: string
 *     responses:
 *       201:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 job:
 *                   $ref: '#/components/schemas/Job'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       400:
 *         description: Validation error
 */
router.post('/', authorize('client'), validateCreateJob, createJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   put:
 *     summary: Update a job posting
 *     tags: [Jobs]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               budget:
 *                 type: number
 *               category:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Job updated successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Job not found
 */
router.put('/:id', authorize('client'), validateUpdateJob, updateJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   delete:
 *     summary: Delete a job posting
 *     tags: [Jobs]
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
 *         description: Job deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Job not found
 */
router.delete('/:id', authorize('client'), deleteJob);

/**
 * @swagger
 * /api/jobs/{id}/close:
 *   patch:
 *     summary: Close a job posting
 *     tags: [Jobs]
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
 *         description: Job closed successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Job not found
 */
router.patch('/:id/close', authorize('client'), closeJob);

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     tags: [Jobs]
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
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 job:
 *                   $ref: '#/components/schemas/Job'
 *       404:
 *         description: Job not found
 */
router.get('/:id', getJobById);

/**
 * @swagger
 * /api/jobs/freelancer/recommended:
 *   get:
 *     summary: Get AI-recommended jobs for freelancer
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Recommended jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (freelancers only)
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/freelancer/recommended', authorize('freelancer'), aiRateLimit('recommendation', { skipAdmin: true }), getRecommendedJobs);

/**
 * @swagger
 * /api/jobs/{id}/recommended-freelancers:
 *   get:
 *     summary: Get AI-recommended freelancers for a job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Recommended freelancers
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (clients only)
 *       404:
 *         description: Job not found
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/:id/recommended-freelancers', authorize('client'), aiRateLimit('recommendation', { skipAdmin: true }), getRecommendedFreelancers);

export default router;

