import express from 'express';
import { authenticate } from '../../core/middlewares/index.js';
import { getAIFeatureStatus } from '../admin/admin.settings.controller.js';

const router = express.Router();

// Public authenticated route - all users can check AI feature status
router.get('/ai-status', authenticate, getAIFeatureStatus);

export default router;
