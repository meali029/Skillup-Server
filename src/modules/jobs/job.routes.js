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
} from './job.controller.js';
import {
  validateCreateJob,
  validateUpdateJob,
  validateJobQuery,
} from './job.validation.js';
import authMiddleware from '../../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', validateJobQuery, getAllJobs);
router.get('/:id', getJobById);

// Protected routes (require authentication)
router.use(authMiddleware);

// Client-specific routes
router.post('/', validateCreateJob, createJob);
router.get('/client/my-jobs', getMyJobs);
router.get('/client/stats', getJobStats);
router.put('/:id', validateUpdateJob, updateJob);
router.delete('/:id', deleteJob);
router.patch('/:id/close', closeJob);

export default router;
