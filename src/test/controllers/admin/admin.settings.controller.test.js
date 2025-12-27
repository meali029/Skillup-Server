import * as controller from '../../../modules/admin/admin.settings.controller.js';
import adminSettingsService from '../../../modules/admin/admin.settings.service.js';
import aiService from '../../../services/ai/ai.service.js';
import createAppError from '../../../core/errors/AppError.js';

jest.mock('../../../modules/admin/admin.settings.service.js');
jest.mock('../../../services/ai/ai.service.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.resetAllMocks());

describe('admin.settings.controller', () => {
  test('getAdminSettings returns settings', async () => {
    const settings = { aiEnabled: true };
    adminSettingsService.getSettings.mockResolvedValue(settings);

    const req = {};
    const res = mockRes();

    await controller.getAdminSettings(req, res);

    expect(adminSettingsService.getSettings).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { settings } }));
  });

  test('updateAdminSettings rejects non-admin', async () => {
    const req = { user: { _id: 'u1', role: 'user' }, body: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.updateAdminSettings(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/Only admins can update settings/);
    expect(err.statusCode || err.status).toBeDefined();
  });

  test('updateAdminSettings succeeds for admin', async () => {
    const req = { user: { _id: 'u1', role: 'admin' }, body: { aiEnabled: true, unknown: 'x' } };
    const res = mockRes();

    const returned = { aiEnabled: true };
    adminSettingsService.updateSettings.mockResolvedValue(returned);

    await controller.updateAdminSettings(req, res);

    expect(adminSettingsService.updateSettings).toHaveBeenCalledWith({ aiEnabled: true, unknown: 'x' }, 'u1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { settings: returned } }));
  });

  test('getAIFeatureStatus maps features and provider', async () => {
    const settings = { aiEnabled: true, aiJobRecommendations: true, aiFreelancerRecommendations: false, aiProposalGeneration: true, aiMatchScoreEnhancement: false, aiProvider: 'openai' };
    adminSettingsService.getSettings.mockResolvedValue(settings);

    const req = {};
    const res = mockRes();

    await controller.getAIFeatureStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aiEnabled: true, provider: 'openai' }) }));
  });

  test('getAIHealthStats and resetAICircuitBreaker call aiService methods', async () => {
    const req = {};
    const res = mockRes();

    // `aiService` is a default instance export; ensure methods exist
    aiService.getHealthStats = aiService.getHealthStats || jest.fn();
    aiService.resetCircuitBreaker = aiService.resetCircuitBreaker || jest.fn();

    aiService.getHealthStats.mockReturnValue({ ok: true });
    await controller.getAIHealthStats(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { ok: true } }));

    await controller.resetAICircuitBreaker(req, res);
    expect(aiService.resetCircuitBreaker).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { reset: true } }));
  });
});