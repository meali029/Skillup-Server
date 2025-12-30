import * as ctrl from '../../../../modules/admin/users/user-management.controller.js';
import * as svc from '../../../../modules/admin/users/user-management.service.js';
import { createAuditLog } from '../../../../core/utils/auditLogger.js';

jest.mock('../../../../modules/admin/users/user-management.service.js');
jest.mock('../../../../core/utils/auditLogger.js');

describe('user-management.controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.resetAllMocks();
    req = { query: {}, params: { id: 'u1' }, body: {}, user: { id: 'admin1' }, ip: '1.1.1.1', get: () => 'ua' };
    res = {};
    res.json = jest.fn();
    res.setHeader = jest.fn();
    res.send = jest.fn();
    res.status = jest.fn().mockReturnValue(res);
    next = jest.fn();
  });

  test('getAllUsers responds with data', async () => {
    svc.getAllUsers.mockResolvedValue({ users: [], pagination: {} });
    console.log('DEBUG before call res keys', Object.keys(res));
    console.log('DEBUG status is function?', typeof res.status === 'function');
    const statusRet = res.status(200);
    console.log('DEBUG statusRet keys', statusRet && Object.keys(statusRet));

    await ctrl.getAllUsers({ query: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    // If next was invoked, surface the error for debugging
    if (next.mock.calls.length > 0) {
      const err = next.mock.calls[0][0];
      throw err || new Error('next() was called without error');
    }
    expect(res.json).toHaveBeenCalled();
  });

  test('getUserById throws when not found', async () => {
    svc.getUserById.mockResolvedValue(null);
    await ctrl.getUserById({ params: { id: 'no' } }, res, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/User not found/);
  });

  test('suspendUser calls service and audit log', async () => {
    svc.suspendUser.mockResolvedValue({ _id: 'u1', isActive: false, name: 'U', email: 'a@b' });
    await ctrl.suspendUser({ params: { id: 'u1' }, body: { reason: 'r' }, user: { id: 'admin1' }, ip: '1.1.1.1', get: () => 'ua' }, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('banUser calls service and audit log', async () => {
    svc.banUser.mockResolvedValue({ _id: 'u1', isBanned: true, name: 'U', email: 'a@b' });
    await ctrl.banUser({ params: { id: 'u1' }, body: { reason: 'r' }, user: { id: 'admin1' }, ip: '1.1.1.1', get: () => 'ua' }, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('activateUser generates right audit action and responds', async () => {
    svc.getUserById.mockResolvedValue({ status: 'suspended' });
    svc.activateUser.mockResolvedValue({ _id: 'u1', isActive: true, name: 'U', email: 'a@b' });
    await ctrl.activateUser({ params: { id: 'u1' }, user: { id: 'admin1' }, ip: '1.1.1.1', get: () => 'ua' }, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('getUserActivity responds with activity', async () => {
    svc.getUserActivity.mockResolvedValue({ user: {}, recentJobs: [], recentProposals: [] });
    await ctrl.getUserActivity({ params: { id: 'u1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('exportUsers sets headers and sends buffer', async () => {
    const buf = Buffer.from('data');
    svc.exportUsers.mockResolvedValue(buf);
    await ctrl.exportUsers({ query: {} }, res, next);
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(buf);
  });
});