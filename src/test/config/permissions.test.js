import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissions,
  hasAnyPermission,
  hasAllPermissions
} from '../../config/permissions.js';

describe('config/permissions', () => {
  it('PERMISSIONS contains expected keys', () => {
    expect(PERMISSIONS.VIEW_USERS).toBeDefined();
    expect(PERMISSIONS.MANAGE_USERS).toBeDefined();
  });

  it('hasPermission works for known and unknown roles', () => {
    expect(hasPermission('admin', PERMISSIONS.VIEW_USERS)).toBe(true);
    expect(hasPermission('moderator', PERMISSIONS.MANAGE_USERS)).toBe(false);
    expect(hasPermission(null, PERMISSIONS.VIEW_USERS)).toBe(false);
    expect(hasPermission('unknown_role', PERMISSIONS.VIEW_USERS)).toBe(false);
  });

  it('getPermissions returns array or empty', () => {
    expect(Array.isArray(getPermissions('admin'))).toBe(true);
    expect(getPermissions('nope')).toEqual([]);
  });

  it('hasAnyPermission and hasAllPermission behave correctly', () => {
    expect(hasAnyPermission('admin', [PERMISSIONS.VIEW_USERS, 'not'])).toBe(true);
    expect(hasAnyPermission('moderator', ['not', 'also'])).toBe(false);

    expect(hasAllPermissions('admin', [PERMISSIONS.VIEW_USERS])).toBe(true);
    expect(hasAllPermissions('admin', [PERMISSIONS.VIEW_USERS, PERMISSIONS.MANAGE_USERS])).toBe(true);
    expect(hasAllPermissions('admin', ['nope'])).toBe(false);
  });
});