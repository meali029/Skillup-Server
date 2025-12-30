import { describe, it, expect } from '@jest/globals';
import AdminSettings from '../../models/AdminSettings.js';

describe('AdminSettings Model', () => {
  it('returns a singleton settings doc and updates properly', async () => {
    const s1 = await AdminSettings.getSettings();
    expect(s1).toBeDefined();

    const updated = await AdminSettings.updateSettings({ aiEnabled: true, customFlag: 'value' });
    expect(updated.aiEnabled).toBe(true);
    // customFlag should live in settings map
    expect(updated.settings.get('customFlag')).toBe('value');

    // getSettings should return the same doc
    const s2 = await AdminSettings.getSettings();
    expect(s2._id.toString()).toBe(updated._id.toString());
  });
});