import express from 'express';
import { getFreelancerById, getUserById, getFreelancers } from './user.controller.js';

const router = express.Router();

// Public routes for user discovery
router.get('/:id', getUserById);
router.get('/freelancers', getFreelancers);
router.get('/freelancers/:id', getFreelancerById);

export default router;