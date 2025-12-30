import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as AuthController from '../../modules/auth/auth.controller.js';
import User from '../../models/User.js';

// Mock TokenService used by controllers
jest.mock('../../modules/shared/services/index.js', () => ({
  TokenService: { generateToken: jest.fn(() => 'ctrl-token'), getCookieOptions: jest.fn(() => ({ httpOnly: true })) }
}));

// Mock notifications and audit logger
jest.mock('../../modules/notifications/notification.service.js', () => ({ notifyUser: jest.fn() }));
jest.mock('../../core/utils/auditLogger.js', () => ({ createAuditLog: jest.fn() }));

describe('Auth Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  const buildRes = () => {
    const res = {};
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((payload) => { res.payload = payload; return res; });
    res.cookie = jest.fn();
    res.clearCookie = jest.fn();
    res.get = jest.fn(()=>'agent');
    return res;
  };

  it('register sets cookie and returns created user', async () => {
    const req = { body: { name: 'RC', email: 'rc@example.com', password: 'pass' } };
    const res = buildRes();

    await AuthController.register(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.cookie).toHaveBeenCalled();
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.token).toBeDefined();
  });

  it('login authenticates and sets cookie', async () => {
    await AuthController.register({ body: { name: 'LC', email: 'lc@example.com', password: 'pass' } }, buildRes());
    const req = { validatedData: { email: 'lc@example.com', password: 'pass' }, ip: '127.0.0.1', get: () => 'ua' };
    const res = buildRes();

    await AuthController.login(req, res);
    expect(res.cookie).toHaveBeenCalled();
    expect(res.payload.success).toBe(true);
  });

  it('me returns user data', async () => {
    const reg = await AuthController.register({ body: { name: 'Me', email: 'me@example.com', password: 'pass' } }, buildRes());
    const u = await User.findOne({ email: 'me@example.com' });
    const req = { user: { id: u._id } };
    const res = buildRes();

    await AuthController.me(req, res);
    expect(res.payload.data.user.email).toBe('me@example.com');
  });

  it('completeProfile updates profile and returns new token', async () => {
    const regRes = buildRes();
    await AuthController.register({ body: { name: 'CP', email: 'cp2@example.com', password: 'pass' } }, regRes);
    const user = await User.findOne({ email: 'cp2@example.com' });

    const req = { user: { id: user._id }, body: { role: 'freelancer', skills: ['JS'], hourlyRate: 10, experience: 'intermediate' } };
    const res = buildRes();

    await AuthController.completeProfile(req, res);
    expect(res.payload.data.isProfileComplete).toBe(true);
    expect(res.payload.data.token).toBeDefined();
  });
});