import * as controller from '../../../modules/admin/permissions/permissions.controller.js';
import * as permConfig from '../../../config/permissions.js';

jest.mock('../../../config/permissions.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('permissions.controller', () => {
  describe('getMyPermissions', () => {
    test('returns 403 when user missing or not admin', async () => {
      const req = { user: null };
      const res = mockRes();

      await controller.getMyPermissions(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

      const req2 = { user: { role: 'user' } };
      const res2 = mockRes();
      await controller.getMyPermissions(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(403);
    });

    test('returns permissions for admin user', async () => {
      permConfig.getPermissions.mockReturnValue(['read', 'write']);

      const req = { user: { role: 'admin', adminRole: 'super' } };
      const res = mockRes();

      await controller.getMyPermissions(req, res);
      expect(permConfig.getPermissions).toHaveBeenCalledWith('super');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ adminRole: 'super', permissions: ['read', 'write'] }) }));
    });

    test('handles errors and returns 500', async () => {
      permConfig.getPermissions.mockImplementation(() => { throw new Error('boom'); });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const req = { user: { role: 'admin', adminRole: 'x' } };
      const res = mockRes();

      await controller.getMyPermissions(req, res);
      expect(spy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      spy.mockRestore();
    });
  });

  describe('getMyAdminProfile', () => {
    test('returns 403 when user missing or not admin', async () => {
      const req = { user: null };
      const res = mockRes();

      await controller.getMyAdminProfile(req, res);
      expect(res.status).toHaveBeenCalledWith(403);

      const req2 = { user: { role: 'client' } };
      const res2 = mockRes();
      await controller.getMyAdminProfile(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(403);
    });

    test('returns admin profile with permissions', async () => {
      permConfig.getPermissions.mockReturnValue(['a', 'b']);

      const user = { _id: 'u1', name: 'Admin', email: 'a@b', avatar: 'av', role: 'admin', adminRole: 'manager', createdAt: '2020-01-01' };
      const req = { user };
      const res = mockRes();

      await controller.getMyAdminProfile(req, res);
      expect(permConfig.getPermissions).toHaveBeenCalledWith('manager');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 'u1', name: 'Admin', email: 'a@b', role: 'admin', adminRole: 'manager', permissions: ['a', 'b'], createdAt: '2020-01-01' }) }));
    });

    test('handles errors and returns 500', async () => {
      permConfig.getPermissions.mockImplementation(() => { throw new Error('x'); });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const req = { user: { _id: 'u1', role: 'admin', adminRole: 'x' } };
      const res = mockRes();

      await controller.getMyAdminProfile(req, res);
      expect(spy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      spy.mockRestore();
    });
  });
});