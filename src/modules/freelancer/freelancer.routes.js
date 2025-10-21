import express from 'express';
import freelancerController from './freelancer.controller.js';
import protect from '../../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes - require authentication
router.get('/me', protect, freelancerController.getProfile);
router.get('/jobs/recommended', protect, freelancerController.getRecommendedJobs);
router.get('/proposals/:freelancerId', protect, freelancerController.getProposals);

export default router;
