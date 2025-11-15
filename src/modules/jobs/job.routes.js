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

router.get('/', validateJobQuery, getAllJobs);

router.use(authenticate);

router.get('/client/my-jobs', authorize('client'), getMyJobs);
router.get('/client/stats', authorize('client'), getJobStats);
router.post('/', authorize('client'), validateCreateJob, createJob);
router.put('/:id', authorize('client'), validateUpdateJob, updateJob);
router.delete('/:id', authorize('client'), deleteJob);
router.patch('/:id/close', authorize('client'), closeJob);

router.get('/:id', getJobById);

export default router;

