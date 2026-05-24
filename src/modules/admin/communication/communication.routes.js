import express from 'express';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import {
  cancelCampaign,
  createCampaign,
  getAudiencePreview,
  getCampaign,
  getCampaigns,
  getDeliveryLogs,
  sendCampaign,
  testCampaign,
  updateCampaign,
} from './communication.controller.js';

const router = express.Router();

router.get('/audience-preview', requirePermission(PERMISSIONS.VIEW_COMMUNICATION), getAudiencePreview);
router.get('/campaigns', requirePermission(PERMISSIONS.VIEW_COMMUNICATION), getCampaigns);
router.post('/campaigns', requirePermission(PERMISSIONS.MANAGE_COMMUNICATION), createCampaign);
router.get('/campaigns/:id', requirePermission(PERMISSIONS.VIEW_COMMUNICATION), getCampaign);
router.put('/campaigns/:id', requirePermission(PERMISSIONS.MANAGE_COMMUNICATION), updateCampaign);
router.post('/campaigns/:id/test', requirePermission(PERMISSIONS.MANAGE_COMMUNICATION), testCampaign);
router.post('/campaigns/:id/send', requirePermission(PERMISSIONS.MANAGE_COMMUNICATION), sendCampaign);
router.post('/campaigns/:id/cancel', requirePermission(PERMISSIONS.MANAGE_COMMUNICATION), cancelCampaign);
router.get('/campaigns/:id/logs', requirePermission(PERMISSIONS.VIEW_COMMUNICATION), getDeliveryLogs);

export default router;
