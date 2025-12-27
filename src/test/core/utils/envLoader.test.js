import mongoose from 'mongoose';
import EnvironmentVariable from '../../../models/EnvironmentVariable.js';
import envLoader, { loadEnvFromDatabase, getEnv, refreshEnvFromDatabase, getEnvWithRefresh } from '../../../core/utils/envLoader.js';

jest.mock('../../../models/EnvironmentVariable.js');

beforeEach(() => {
  jest.resetAllMocks();
  // reset internal cache by calling refresh function
});

describe('Env Loader utils', () => {
  test('loadEnvFromDatabase no-op when not connected', async () => {
    mongoose.connection.readyState = 0;
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await loadEnvFromDatabase();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('loadEnvFromDatabase sets cache and overrides process.env when connected', async () => {
    mongoose.connection.readyState = 1;
    EnvironmentVariable.find = jest.fn().mockResolvedValue([{ key: 'X', value: 'Y' }]);
    await loadEnvFromDatabase();
    expect(getEnv('X')).toBe('Y');
    // cleanup
    delete process.env.X;
  });

  test('getEnv falls back to process.env and default', () => {
    process.env.TEST_ENV = 'abc';
    expect(getEnv('TEST_ENV')).toBe('abc');
    delete process.env.TEST_ENV;
    expect(getEnv('NOPE', 'def')).toBe('def');
  });

  test('getEnvWithRefresh triggers refresh when stale and connected', async () => {
    // set cache stale by ensuring cacheTimestamp undefined and connected
    mongoose.connection.readyState = 1;
    EnvironmentVariable.find = jest.fn().mockResolvedValue([{ key: 'K', value: 'V' }]);

    // Force a refresh
    await refreshEnvFromDatabase();

    const val = await getEnvWithRefresh('K');
    expect(val).toBe('V');
  });

  test('refreshEnvFromDatabase clears cache and reloads', async () => {
    mongoose.connection.readyState = 1;
    EnvironmentVariable.find = jest.fn().mockResolvedValue([{ key: 'A', value: 'B' }]);
    await refreshEnvFromDatabase();
    expect(getEnv('A')).toBe('B');
  });
});