import { describe, it, expect } from '@jest/globals';

describe('core/health', () => {
  it('getDatabaseHealth returns connected info when mongoose ready', async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      const mongooseMock = { __esModule: true, default: { connection: { readyState: 1, name: 'mydb', host: 'localhost' } } };
      jest.doMock('mongoose', () => mongooseMock);
      // eslint-disable-next-line global-require
      const { getDatabaseHealth } = require('../../core/health.js');
      return getDatabaseHealth().then((res) => {
        expect(res.status).toBe('healthy');
        expect(res.ready).toBe(true);
        expect(res.name).toBe('mydb');
      });
    });
  });

  it('getDatabaseHealth returns unhealthy when disconnected', async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      const mongooseMock = { __esModule: true, default: { connection: { readyState: 0 } } };
      jest.doMock('mongoose', () => mongooseMock);
      // eslint-disable-next-line global-require
      const { getDatabaseHealth } = require('../../core/health.js');
      return getDatabaseHealth().then((res) => {
        expect(res.status).toBe('unhealthy');
        expect(res.ready).toBe(false);
      });
    });
  });

  it('getDatabaseHealth returns error shape when import throws', async () => {
    jest.isolateModules(async () => {
      jest.resetModules();
      // make dynamic import throw
      jest.doMock('mongoose', () => ({ __esModule: true, get default() { throw new Error('boom'); } }));
      // eslint-disable-next-line global-require
      const { getDatabaseHealth } = require('../../core/health.js');
      return getDatabaseHealth().then((res) => {
        expect(res.status).toBe('unhealthy');
        expect(res.error).toMatch(/boom/);
        expect(res.ready).toBe(false);
      });
    });
  });

  it('isDatabaseConnected returns boolean and handles errors', async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('mongoose', () => ({ __esModule: true, default: { connection: { readyState: 1 } } }));
      // eslint-disable-next-line global-require
      const { isDatabaseConnected } = require('../../core/health.js');
      return isDatabaseConnected().then((res) => expect(typeof res).toBe('boolean'));
    });

    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('mongoose', () => ({ __esModule: true, default: { connection: { readyState: 0 } } }));
      // eslint-disable-next-line global-require
      const { isDatabaseConnected } = require('../../core/health.js');
      return isDatabaseConnected().then((res) => expect(typeof res).toBe('boolean'));
    });

    jest.isolateModules(() => {
      jest.resetModules();
      // Make dynamic import throw so isDatabaseConnected returns false
      jest.doMock('mongoose', () => ({ __esModule: true, get default() { throw new Error('boom'); } }));
      // eslint-disable-next-line global-require
      const { isDatabaseConnected } = require('../../core/health.js');
      return isDatabaseConnected().then((res) => expect(res).toBe(false));
    });
  });
});