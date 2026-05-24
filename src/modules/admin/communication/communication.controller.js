import { asyncHandler, successResponse } from '../../../core/utils/index.js';
import * as communicationService from './communication.service.js';

const getAdminId = (req) => req.user?.id || req.user?._id;

export const getCampaigns = asyncHandler(async (req, res) => {
  const data = await communicationService.listCampaigns(req.query);
  successResponse(res, data, 'Email campaigns retrieved successfully');
});

export const getCampaign = asyncHandler(async (req, res) => {
  const campaign = await communicationService.getCampaign(req.params.id);
  successResponse(res, { campaign }, 'Email campaign retrieved successfully');
});

export const createCampaign = asyncHandler(async (req, res) => {
  const campaign = await communicationService.createCampaign(req.body, getAdminId(req));
  successResponse(res, { campaign }, 'Email campaign created successfully', 201);
});

export const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await communicationService.updateCampaign(req.params.id, req.body);
  successResponse(res, { campaign }, 'Email campaign updated successfully');
});

export const testCampaign = asyncHandler(async (req, res) => {
  const result = await communicationService.sendCampaignTest(req.params.id, req.body.email);
  successResponse(res, { result }, 'Test campaign email sent successfully');
});

export const sendCampaign = asyncHandler(async (req, res) => {
  const campaign = await communicationService.sendCampaign(req.params.id, getAdminId(req));
  successResponse(res, { campaign }, 'Email campaign queued successfully');
});

export const cancelCampaign = asyncHandler(async (req, res) => {
  const campaign = await communicationService.cancelCampaign(req.params.id);
  successResponse(res, { campaign }, 'Email campaign cancelled successfully');
});

export const getDeliveryLogs = asyncHandler(async (req, res) => {
  const data = await communicationService.listDeliveryLogs({
    campaignId: req.params.id,
    ...req.query,
  });
  successResponse(res, data, 'Campaign delivery logs retrieved successfully');
});

export const getAudiencePreview = asyncHandler(async (req, res) => {
  const data = await communicationService.previewAudience({
    audienceType: req.query.audienceType,
    customEmails: req.query.customEmails,
  });
  successResponse(res, data, 'Audience preview retrieved successfully');
});
