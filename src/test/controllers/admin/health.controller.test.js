import * as controller from '../../../modules/admin/health/health.controller.js';
import aiService from '../../../services/ai/ai.service.js';
import mongoose from 'mongoose';
import os from 'os';

jest.mock('../../../services/ai/ai.service.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('health.controller', () => {
  describe('getSystemHealth', () => {
    test('returns system health when db healthy', async () => {
      // Mock mongoose connection
      mongoose.connection.readyState = 1;
      mongoose.connection.name = 'testdb';
      mongoose.connection.host = 'localhost';

      // Mock os and process memory for deterministic output
      jest.spyOn(os, 'totalmem').mockReturnValue(8 * 1024 * 1024 * 1024);
      jest.spyOn(os, 'freemem').mockReturnValue(2 * 1024 * 1024 * 1024);
      jest.spyOn(os, 'cpus').mockReturnValue([{ model: 'x' }, {}]);
      jest.spyOn(os, 'loadavg').mockReturnValue([0.1, 0.2, 0.3]);
      const memSpy = jest.spyOn(process, 'memoryUsage').mockReturnValue({ rss: 10 * 1024 * 1024, heapTotal: 5 * 1024 * 1024, heapUsed: 3 * 1024 * 1024, external: 1 * 1024 * 1024 });

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getSystemHealth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ database: expect.objectContaining({ status: 'healthy', name: 'testdb' }), cpu: expect.objectContaining({ model: 'x', cores: 2 }) }) }));

      memSpy.mockRestore();
    });

    test('returns degraded status when db unhealthy', async () => {
      mongoose.connection.readyState = 0;
      mongoose.connection.name = 'db';
      mongoose.connection.host = 'h';

      jest.spyOn(os, 'totalmem').mockReturnValue(4 * 1024 * 1024 * 1024);
      jest.spyOn(os, 'freemem').mockReturnValue(4 * 1024 * 1024 * 1024);
      jest.spyOn(os, 'cpus').mockReturnValue([{ model: 'y' }]);
      jest.spyOn(os, 'loadavg').mockReturnValue([0.0, 0.0, 0.0]);
      jest.spyOn(process, 'memoryUsage').mockReturnValue({ rss: 1, heapTotal: 1, heapUsed: 1, external: 0 });

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getSystemHealth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'degraded' }) }));
    });

    test('forwards errors to next when underlying code throws', async () => {
      // Cause os.totalmem to throw to trigger asyncHandler error path
      const osSpy = jest.spyOn(os, 'totalmem').mockImplementation(() => { throw new Error('oom'); });

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getSystemHealth(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));

      osSpy.mockRestore();
    });
  });

  describe('getAIHealth', () => {
    test('returns ai health on success', async () => {
      aiService.getHealthStatus.mockResolvedValue({ status: 'healthy', provider: 'gemini' });

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getAIHealth(req, res, next);

      expect(aiService.getHealthStatus).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'healthy' }) }));
    });

    test('forwards error to next when aiService fails', async () => {
      aiService.getHealthStatus.mockRejectedValue(new Error('ai fail'));

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getAIHealth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getCircuitBreakerStats and resetCircuitBreaker', () => {
    test('returns stats and resets circuit breaker', async () => {
      const stats = { state: 'CLOSED' };
      aiService.getCircuitBreakerStats.mockReturnValue(stats);

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getCircuitBreakerStats(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: stats }));

      // reset
      const res2 = mockRes();
      aiService.resetCircuitBreaker.mockImplementation(() => {});
      await controller.resetCircuitBreaker(req, res2, next);
      expect(aiService.resetCircuitBreaker).toHaveBeenCalled();
      expect(res2.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getHealthDashboard', () => {
    test('returns combined dashboard data', async () => {
      aiService.getHealthStatus.mockResolvedValue({ status: 'healthy' });
      aiService.getCircuitBreakerStats.mockResolvedValue({ state: 'CLOSED' });

      mongoose.connection.readyState = 1;

      jest.spyOn(process, 'memoryUsage').mockReturnValue({ heapUsed: 10 * 1024 * 1024, heapTotal: 20 * 1024 * 1024 });
      jest.spyOn(os, 'freemem').mockReturnValue(1 * 1024 * 1024 * 1024);
      jest.spyOn(os, 'totalmem').mockReturnValue(8 * 1024 * 1024 * 1024);

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getHealthDashboard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ system: expect.any(Object), ai: expect.objectContaining({ status: 'healthy' }), circuitBreaker: expect.objectContaining({ state: 'CLOSED' }) }) }));
    });

    test('forwards error when one of the Promise.any fails', async () => {
      aiService.getHealthStatus.mockRejectedValue(new Error('fail'));

      const req = {};
      const res = mockRes();
      const next = jest.fn();

      await controller.getHealthDashboard(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});