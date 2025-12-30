import * as AuthController from '../../../modules/auth/auth.controller.js';
import * as AuthService from '../../../modules/auth/auth.service.js';
import { TokenService } from '../../../modules/shared/services/index.js';
import User from '../../../models/User.js';

jest.mock('../../../models/User.js');

describe('Auth Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, validatedData: {}, user: null, ip: '1.2.3.4', get: () => 'ua', session: { messages: ['oops'] } };
    res = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
      clearCookie: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('register sets cookie and responds', async () => {
    jest.spyOn(AuthService, 'registerLocal').mockResolvedValue({ user: { isProfileComplete: true, _id: 'u1' }, token: 'T' });
    jest.spyOn(TokenService, 'getCookieOptions').mockReturnValue({});

    await AuthController.register({ validatedData: { email: 'a' } }, res, next);

    expect(res.cookie).toHaveBeenCalledWith('token', 'T', {});
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('login notifies user and handles notify failure silently', async () => {
    const user = { role: 'user', _id: 'u1', email: 'e@test.com' };
    jest.spyOn(AuthService, 'loginLocal').mockResolvedValue({ user, token: 'TK' });
    jest.spyOn(TokenService, 'getCookieOptions').mockReturnValue({});
    jest.spyOn(require('../../../modules/notifications/notification.service.js'), 'notifyUser').mockRejectedValue(new Error('boom'));

    await AuthController.login({ validatedData: { email: 'a', password: 'p' }, ip: '1.2.3.4', get: () => 'ua' }, res, next);

    expect(res.cookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('login triggers admin audit log when admin', async () => {
    const admin = { role: 'admin', _id: 'admin1', email: 'a@test.com' };
    jest.spyOn(AuthService, 'loginLocal').mockResolvedValue({ user: admin, token: 'TK' });
    jest.spyOn(TokenService, 'getCookieOptions').mockReturnValue({});
    jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

    await AuthController.login({ validatedData: { email: 'a', password: 'p' }, ip: '1.2.3.4', get: () => 'ua' }, res, next);

    const audit = require('../../../core/utils/auditLogger.js');
    expect(audit.createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('googleCallback redirects to login with error when no user', async () => {
    await AuthController.googleCallback({ session: { messages: ['fail'] } }, res, next);
    expect(res.redirect).toHaveBeenCalled();
    const url = res.redirect.mock.calls[0][0];
    expect(url).toContain('error=fail');
  });

  test('googleCallback redirects with profileIncomplete when needed', async () => {
    const user = { isProfileComplete: false, role: null };
    jest.spyOn(TokenService, 'generateToken').mockReturnValue('TKN');

    await AuthController.googleCallback({ user }, res, next);
    expect(res.cookie).toHaveBeenCalledWith('token', 'TKN', expect.any(Object));
    const url = res.redirect.mock.calls[0][0];
    expect(url).toContain('profileIncomplete=true');
  });

  test('completeProfile validation errors call next with error', async () => {
    await AuthController.completeProfile({ user: { id: 'u1' }, body: {} }, res, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/Role is required/);
  });

  test('completeProfile success calls token generation and responds', async () => {
    jest.spyOn(AuthService, 'completeProfile').mockResolvedValue({});
    jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ isProfileComplete: true }) });
    jest.spyOn(TokenService, 'generateToken').mockReturnValue('TK');

    await AuthController.completeProfile({ user: { id: 'u1' }, body: { role: 'client', companyName: 'c', companySize: 's', industry: 'i' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logout clears cookie and responds and logs admin logout when admin', async () => {
    await AuthController.logout({ user: { role: 'admin', id: 'a1' }, ip: '1.2.3.4', get: () => 'ua' }, res, next);
    expect(res.clearCookie).toHaveBeenCalledWith('token', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('me throws when no user', async () => {
    await AuthController.me({ }, res, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/Not authenticated/);
  });

  test('me responds with user when found', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'u1' }) });
    await AuthController.me({ user: { id: 'u1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('password controllers call underlying services and respond', async () => {
    jest.spyOn(AuthService, 'requestPasswordReset').mockResolvedValue({ message: 'ok' });
    jest.spyOn(AuthService, 'verifyOTPService').mockResolvedValue({ message: 'ok', verified: true });
    jest.spyOn(AuthService, 'resetPassword').mockResolvedValue({ message: 'ok' });

    await AuthController.requestPasswordResetController({ validatedData: { email: 'a' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);

    await AuthController.verifyOTPController({ validatedData: { email: 'a', otp: '1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);

    await AuthController.resetPasswordController({ validatedData: { email: 'a', otp: '1', newPassword: 'n' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('cnic placeholder controllers throw error', async () => {
    const next2 = jest.fn();
    await AuthController.uploadCNICFrontController({}, res, next2);
    expect(next2).toHaveBeenCalled();
    const err = next2.mock.calls[0][0];
    expect(err.message).toMatch(/Please use \/api\/cnic/);
  });
});