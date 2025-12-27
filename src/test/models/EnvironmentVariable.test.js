import { describe, it, expect } from '@jest/globals';
import EnvironmentVariable from '../../models/EnvironmentVariable.js';

describe('EnvironmentVariable Model', () => {
  it('sets, gets, and returns public vars as object', async () => {
    await EnvironmentVariable.setVariable('TEST_KEY', 'value1');
    await EnvironmentVariable.setVariable('PUBLIC_KEY', 'pubval', { isPublic: true });

    const asObj = await EnvironmentVariable.getAllAsObject();
    expect(asObj.TEST_KEY).toBe('value1');
    expect(asObj.PUBLIC_KEY).toBe('pubval');

    const byKey = await EnvironmentVariable.getByKey('TEST_KEY');
    expect(byKey).toBe('value1');

    const publicVars = await EnvironmentVariable.getPublicVariables();
    expect(publicVars.PUBLIC_KEY).toBe('pubval');
  });
});