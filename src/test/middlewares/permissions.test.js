import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireAdminRole,
  requireSuperAdmin,
  checkPermission
} from '../../core/middlewares/permissions.js';

jest.mock('../../config/permissions.js', () => ({
  hasPermission: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn(),
}));

import { hasPermission, hasAnyPermission, hasAllPermissions } from '../../config/permissions.js';

describe('permissions middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

  it('requirePermission - unauthenticated', () => {
    const mw = requirePermission('X');
    const res = makeRes();
    const next = jest.fn();
    mw({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Authentication required' }));
  });

  it('requirePermission - not admin', () => {
    const mw = requirePermission('X');
    const req = { user: { role: 'client' } };
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Admin access required' }));
  });

  it('requirePermission - insufficient permission', () => {
    hasPermission.mockReturnValue(false);
    const mw = requirePermission('VIEW');
    const req = { user: { role: 'admin', adminRole: 'moderator' } };
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(hasPermission).toHaveBeenCalledWith('moderator', 'VIEW');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient permissions', required: 'VIEW' }));
  });

  it('requirePermission - success', () => {
    hasPermission.mockReturnValue(true);
    const mw = requirePermission('EDIT');
    const req = { user: { role: 'admin', adminRole: 'admin' } };
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireAnyPermission - insufficient', () => {
    hasAnyPermission.mockReturnValue(false);
    const mw = requireAnyPermission(['A', 'B']);
    const req = { user: { role: 'admin', adminRole: 'admin' } };
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(hasAnyPermission).toHaveBeenCalledWith('admin', ['A', 'B']);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ required: expect.stringContaining('One of:') }));
  });

  it('requireAllPermissions - insufficient', () => {
    hasAllPermissions.mockReturnValue(false);
    const mw = requireAllPermissions(['A', 'B']);
    const req = { user: { role: 'admin', adminRole: 'admin' } };
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(hasAllPermissions).toHaveBeenCalledWith('admin', ['A', 'B']);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ required: expect.stringContaining('All of:') }));
  });

  it('requireAdminRole - hierarchy check', () => {
    const mw = requireAdminRole('admin');
    const res = makeRes();
    const next = jest.fn();

    mw({ user: null }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);

    mw({ user: { role: 'client' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);

    mw({ user: { role: 'admin', adminRole: 'moderator' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);

    mw({ user: { role: 'admin', adminRole: 'admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('requireSuperAdmin - enforces super_admin', () => {
    const mw = requireSuperAdmin();
    const res = makeRes();
    const next = jest.fn();

    mw({ user: null }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);

    mw({ user: { role: 'admin', adminRole: 'admin' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);

    mw({ user: { role: 'admin', adminRole: 'super_admin' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('checkPermission - returns expected booleans', () => {
    expect(checkPermission(null, 'X')).toBe(false);
    expect(checkPermission({ role: 'client' }, 'X')).toBe(false);
    hasPermission.mockReturnValue(true);
    expect(checkPermission({ role: 'admin', adminRole: 'admin' }, 'X')).toBe(true);
  });
});