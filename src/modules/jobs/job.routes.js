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
import { authenticate, authorize } from '../../core/middlewares/index.js';

const router = express.Router();

// Public routes
router.get('/', validateJobQuery, getAllJobs);
router.get('/:id', getJobById);

// Protected routes (require authentication)
router.use(authenticate);

// Client-specific routes (require client role)
router.post('/', authorize('client'), validateCreateJob, createJob);
router.get('/client/my-jobs', authorize('client'), getMyJobs);
router.get('/client/stats', authorize('client'), getJobStats);
router.put('/:id', authorize('client'), validateUpdateJob, updateJob);
router.delete('/:id', authorize('client'), deleteJob);
router.patch('/:id/close', authorize('client'), closeJob);

export default router;

