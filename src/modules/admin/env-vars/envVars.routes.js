import express from 'express';
import { authenticate, authorizeAdmin } from '../../../core/middlewares/index.js';
import {
  getEnvVars,
  getEnvVar,
  setEnvVar,
  deleteEnvVar,
  setBulkEnvVars,
  getPublicEnvVars,
} from './envVars.controller.js';

const router = express.Router();

// Public endpoint for frontend to get public env vars
router.get('/public', getPublicEnvVars);

// All other routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

// Get all environment variables
router.get('/', getEnvVars);

// Get a single environment variable
router.get('/:key', getEnvVar);

// Create or update an environment variable
router.post('/', setEnvVar);
router.put('/:key', setEnvVar);

// Delete an environment variable
router.delete('/:key', deleteEnvVar);

// Bulk set environment variables
router.post('/bulk', setBulkEnvVars);

export default router;

