import { describe, it, expect } from '@jest/globals';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';

describe('AuditLog Model', () => {
  it('creates audit log and prevents deletion', async () => {
    const admin = await User.create({ name: 'Admin', email: 'admin@example.com' });

    const a = await AuditLog.create({ adminId: admin._id, action: 'ADMIN_LOGIN', targetType: 'System' });
    expect(a).toBeDefined();
    expect(a.action).toBe('ADMIN_LOGIN');

    // Attempt to delete should throw due to pre hooks
    await expect(AuditLog.deleteOne({ _id: a._id })).rejects.toThrow();

    // findOneAndDelete should also throw
    await expect(AuditLog.findOneAndDelete({ _id: a._id })).rejects.toThrow();
  });
});