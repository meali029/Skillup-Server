import express from 'express';
import { authenticate } from '../../../core/middlewares/index.js';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import {
  getAdminSessions,
  revokeAdminSession,
} from './admin-sessions.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.VIEW_ADMINS), getAdminSessions);
router.delete('/:sessionId', requirePermission(PERMISSIONS.MANAGE_ADMINS), revokeAdminSession);

export default router;
