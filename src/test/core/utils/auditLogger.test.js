import * as audit from '../../../core/utils/auditLogger.js';
import AuditLog from '../../../models/AuditLog.js';

jest.mock('../../../models/AuditLog.js');

beforeEach(() => jest.resetAllMocks());

describe('Audit Logger utils', () => {
  test('createAuditLog returns created log and null on error', async () => {
    AuditLog.create = jest.fn().mockResolvedValue({ id: '1' });
    const res = await audit.createAuditLog({ adminId: 'a', action: 'ADMIN_LOGIN' });
    expect(res).toEqual({ id: '1' });

    AuditLog.create = jest.fn().mockRejectedValue(new Error('bad'));
    const res2 = await audit.createAuditLog({});
    expect(res2).toBeNull();
  });

  test('getAuditLogs returns logs and pagination info', async () => {
    const logs = [{ _id: '1', createdAt: new Date() }];
    const mockFindChain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(logs),
    };
    AuditLog.find = jest.fn().mockReturnValue(mockFindChain);
    AuditLog.countDocuments = jest.fn().mockResolvedValue(10);

    const out = await audit.getAuditLogs({ page: 1, limit: 5 });
    expect(out.logs).toBe(logs);
    expect(out.total).toBe(10);
    expect(out.totalPages).toBe(Math.ceil(10 / 5));
  });

  test('getAuditLogById uses findById', async () => {
    const log = { _id: 'x' };
    AuditLog.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(log) });
    const res = await audit.getAuditLogById('x');
    expect(res).toBe(log);
  });

  test('getAuditLogStats returns aggregated stats', async () => {
    const agg = [{ totalLogs: [{ count: 2 }], byAction: [], byAdmin: [], recentActivity: [] }];
    AuditLog.aggregate = jest.fn().mockResolvedValue(agg);
    const stats = await audit.getAuditLogStats({});
    expect(stats.totalLogs).toBe(2);
  });

  test('exportAuditLogs maps fields', async () => {
    const logs = [{ createdAt: new Date(0), adminId: { name: 'A', email: 'a@b' }, action: 'ACT', targetType: 'User', targetName: 'Bob', metadata: { reason: 'r' }, ipAddress: '1.2.3.4' }];
    const mockFindChain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(logs),
    };

    AuditLog.find = jest.fn().mockReturnValue(mockFindChain);
    AuditLog.countDocuments = jest.fn().mockResolvedValue(1);

    const rows = await audit.exportAuditLogs({});
    expect(rows[0].Admin).toBe('A');
    expect(rows[0].Action).toBe('ACT');
  });
});