import AdminSettingsService from '../../../../modules/admin/admin.settings.service.js';
import AdminSettings from '../../../../models/AdminSettings.js';

jest.mock('../../../../models/AdminSettings.js');

beforeEach(() => jest.resetAllMocks());

describe('AdminSettingsService', () => {
  test('getSettings returns settings and throws on model error', async () => {
    const s = { aiEnabled: true };
    AdminSettings.getSettings = jest.fn().mockResolvedValue(s);
    const out = await AdminSettingsService.getSettings();
    expect(out).toBe(s);

    AdminSettings.getSettings = jest.fn().mockRejectedValue(new Error('db'));
    await expect(AdminSettingsService.getSettings()).rejects.toThrow('Failed to retrieve admin settings');
  });

  test('updateSettings filters allowed fields and returns settings', async () => {
    const saved = { aiEnabled: true };
    AdminSettings.updateSettings = jest.fn().mockResolvedValue(saved);

    const updates = { aiEnabled: true, foo: 'bar' };
    const res = await AdminSettingsService.updateSettings(updates, 'admin1');

    expect(AdminSettings.updateSettings).toHaveBeenCalledWith({ aiEnabled: true });
    expect(res).toBe(saved);
  });

  test('updateSettings throws on model error', async () => {
    AdminSettings.updateSettings = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(AdminSettingsService.updateSettings({ aiEnabled: true }, 'a')).rejects.toThrow('Failed to update admin settings');
  });

  test('isAIEnabled returns true/false and false on errors', async () => {
    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({ aiEnabled: true });
    expect(await AdminSettingsService.isAIEnabled()).toBe(true);

    jest.spyOn(AdminSettingsService, 'getSettings').mockRejectedValue(new Error('err'));
    expect(await AdminSettingsService.isAIEnabled()).toBe(false);
  });

  test('isFeatureEnabled behavior', async () => {
    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({ aiEnabled: false });
    expect(await AdminSettingsService.isFeatureEnabled('jobRecommendations')).toBe(false);

    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({ aiEnabled: true, aiJobRecommendations: true });
    expect(await AdminSettingsService.isFeatureEnabled('jobRecommendations')).toBe(true);

    // unknown feature
    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({ aiEnabled: true });
    expect(await AdminSettingsService.isFeatureEnabled('unknown')).toBe(false);

    // errors return false
    jest.spyOn(AdminSettingsService, 'getSettings').mockRejectedValue(new Error('err'));
    expect(await AdminSettingsService.isFeatureEnabled('jobRecommendations')).toBe(false);
  });

  test('getAIProvider returns provider or default', async () => {
    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({ aiProvider: 'openai' });
    expect(await AdminSettingsService.getAIProvider()).toBe('openai');

    jest.spyOn(AdminSettingsService, 'getSettings').mockResolvedValue({});
    expect(await AdminSettingsService.getAIProvider()).toBe('gemini');

    jest.spyOn(AdminSettingsService, 'getSettings').mockRejectedValue(new Error('x'));
    expect(await AdminSettingsService.getAIProvider()).toBe('gemini');
  });
});