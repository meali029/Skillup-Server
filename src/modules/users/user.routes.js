import express from 'express';
import { getFreelancerById, getUserById, getFreelancers } from './user.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/users/freelancers:
 *   get:
 *     summary: Get all freelancers
 *     tags: [Users]
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
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated skills
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of freelancers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 freelancers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */
router.get('/freelancers', getFreelancers);

/**
 * @swagger
 * /api/users/freelancers/{id}:
 *   get:
 *     summary: Get freelancer by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Freelancer details
 *       404:
 *         description: Freelancer not found
 */
router.get('/freelancers/:id', getFreelancerById);

export default router;