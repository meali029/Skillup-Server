import * as controller from '../../../modules/admin/audit-logs/audit-logs.controller.js';
import * as auditLogger from '../../../core/utils/auditLogger.js';
import { Parser } from 'json2csv';

jest.mock('../../../core/utils/auditLogger.js');
jest.mock('json2csv', () => ({ Parser: jest.fn() }));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('audit-logs.controller', () => {
  describe('getAuditLogsController', () => {
    test('returns logs with filters', async () => {
      const data = { logs: [{ _id: '1' }], pagination: { total: 1 } };
      auditLogger.getAuditLogs.mockResolvedValue(data);

      const req = { query: { page: '2', limit: '10' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogsController(req, res, next);

      expect(auditLogger.getAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 10 }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data }));
    });

    test('forwards errors to next', async () => {
      auditLogger.getAuditLogs.mockRejectedValue(new Error('fail'));
      const req = { query: {} };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogsController(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getAuditLogByIdController', () => {
    test('returns single log when found', async () => {
      const log = { _id: '1' };
      auditLogger.getAuditLogById.mockResolvedValue(log);

      const req = { params: { id: '1' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogByIdController(req, res, next);
      expect(auditLogger.getAuditLogById).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: log }));
    });

    test('calls next with AppError when not found', async () => {
      auditLogger.getAuditLogById.mockResolvedValue(null);

      const req = { params: { id: 'x' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogByIdController(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Audit log not found' }));
    });

    test('forwards exceptions to next', async () => {
      auditLogger.getAuditLogById.mockRejectedValue(new Error('boom'));
      const req = { params: { id: 'x' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogByIdController(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getAuditLogStatsController', () => {
    test('returns stats', async () => {
      const stats = { total: 5 };
      auditLogger.getAuditLogStats.mockResolvedValue(stats);

      const req = { query: { startDate: 's', endDate: 'e' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogStatsController(req, res, next);
      expect(auditLogger.getAuditLogStats).toHaveBeenCalledWith({ startDate: 's', endDate: 'e' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: stats }));
    });

    test('forwards errors to next', async () => {
      auditLogger.getAuditLogStats.mockRejectedValue(new Error('err'));
      const req = { query: {} };
      const res = mockRes();
      const next = jest.fn();

      await controller.getAuditLogStatsController(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('exportAuditLogsController', () => {
    test('parses logs and sends csv with headers', async () => {
      const logs = [{ _id: '1', action: 'X' }];
      auditLogger.exportAuditLogs.mockResolvedValue(logs);

      // Mock Parser
      const parseMock = jest.fn().mockReturnValue('a,b,c');
      Parser.mockImplementation(() => ({ parse: parseMock }));

      const req = { query: { adminId: 'a' } };
      const res = mockRes();
      const next = jest.fn();

      await controller.exportAuditLogsController(req, res, next);

      expect(auditLogger.exportAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'a' }));
      expect(Parser).toHaveBeenCalled();
      expect(parseMock).toHaveBeenCalledWith(logs);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(expect.stringContaining('Content-Disposition'), expect.stringMatching(/audit-logs-\d+\.csv/));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('a,b,c');
    });

    test('forwards errors to next', async () => {
      auditLogger.exportAuditLogs.mockRejectedValue(new Error('o')); 
      const req = { query: {} };
      const res = mockRes();
      const next = jest.fn();

      await controller.exportAuditLogsController(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});