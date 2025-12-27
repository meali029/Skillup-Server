import * as AuthService from '../../../modules/auth/auth.service.js';
import User from '../../../models/User.js';
import * as SharedServices from '../../../modules/shared/services/index.js';
import * as otpUtil from '../../../core/utils/otpService.js';
import * as emailService from '../../../core/utils/emailService.js';

jest.mock('../../../models/User.js');

describe('Auth Service (unit tests)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('registerLocal', () => {
    test('throws when email already exists', async () => {
      User.findOne.mockResolvedValue({ _id: '1' });
      await expect(AuthService.registerLocal({ email: 'a@b.com' })).rejects.toThrow('Email already registered');
    });

    test('creates a freelancer and returns token and user', async () => {
      User.findOne.mockResolvedValue(null);
      const fakeUser = {
        _id: 'u1',
        checkProfileComplete: jest.fn().mockReturnValue(true),
        isProfileComplete: false,
        save: jest.fn().mockResolvedValue(true),
      };
      User.create.mockResolvedValue(fakeUser);
      const savedUser = { _id: 'u1', email: 'u@test.com', role: 'freelancer' };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(savedUser) });

      jest.spyOn(SharedServices.TokenService, 'generateToken').mockReturnValue('TOKEN123');

      const res = await AuthService.registerLocal({ name: 'U', email: 'u@test.com', password: 'P', role: 'freelancer', skills: ['js'], hourlyRate: '20', experience: '3' });

      expect(res.token).toBe('TOKEN123');
      expect(res.user).toEqual(savedUser);
      expect(fakeUser.checkProfileComplete).toHaveBeenCalled();
      expect(fakeUser.save).toHaveBeenCalled();
    });
  });

  describe('completeProfile', () => {
    test('throws when user not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(AuthService.completeProfile('nope', {})).rejects.toThrow('User not found');
    });

    test('throws on invalid role', async () => {
      User.findById.mockResolvedValue({});
      await expect(AuthService.completeProfile('id', { role: 'bad' })).rejects.toThrow('Valid role');
    });

    test('validates freelancer required fields', async () => {
      const user = { save: jest.fn(), isProfileComplete: false };
      User.findById.mockResolvedValue(user);
      await expect(AuthService.completeProfile('id', { role: 'freelancer', skills: [], hourlyRate: 0, experience: '' })).rejects.toThrow('At least one skill is required');
    });

    test('completes freelancer profile successfully', async () => {
      const user = { save: jest.fn().mockResolvedValue(true), isProfileComplete: false };
      User.findById.mockResolvedValue(user);
      const savedUser = { _id: 'u1', isProfileComplete: true };
      User.findById.mockReturnValueOnce(user).mockReturnValueOnce({ select: jest.fn().mockResolvedValue(savedUser) });

      const res = await AuthService.completeProfile('id', { role: 'freelancer', skills: ['js'], hourlyRate: 10, experience: '3' });
      expect(res).toEqual(savedUser);
    });

    test('validates client required fields', async () => {
      const user = { save: jest.fn(), isProfileComplete: false };
      User.findById.mockResolvedValue(user);
      await expect(AuthService.completeProfile('id', { role: 'client', companyName: '', companySize: '', industry: '' })).rejects.toThrow('Company name is required');
    });
  });

  describe('loginLocal', () => {
    test('invalid credentials when user not found', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(AuthService.loginLocal({ email: 'x', password: 'p' })).rejects.toThrow('Invalid credentials');
    });

    test('invalid credentials when provider not local', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ provider: 'google' }) });
      await expect(AuthService.loginLocal({ email: 'x', password: 'p' })).rejects.toThrow('Invalid credentials');
    });

    test('invalid credentials when password wrong', async () => {
      const user = { provider: 'local', comparePassword: jest.fn().mockResolvedValue(false) };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      await expect(AuthService.loginLocal({ email: 'x', password: 'p' })).rejects.toThrow('Invalid credentials');
    });

    test('banned and suspended checks', async () => {
      const bannedUser = { provider: 'local', comparePassword: jest.fn().mockResolvedValue(true), isBanned: true };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(bannedUser) });
      await expect(AuthService.loginLocal({ email: 'x', password: 'p' })).rejects.toThrow('banned');

      const suspendedUser = { provider: 'local', comparePassword: jest.fn().mockResolvedValue(true), isBanned: false, isActive: false };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(suspendedUser) });
      await expect(AuthService.loginLocal({ email: 'x', password: 'p' })).rejects.toThrow('suspended');
    });

    test('successful login returns token and user without password', async () => {
      const user = { provider: 'local', comparePassword: jest.fn().mockResolvedValue(true), isBanned: false, isActive: true, toObject: jest.fn().mockReturnValue({ _id: 'u1', password: 'h' }) };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(SharedServices.TokenService, 'generateToken').mockReturnValue('TK');
      const res = await AuthService.loginLocal({ email: 'x', password: 'p' });
      expect(res.token).toBe('TK');
      expect(res.user.password).toBeUndefined();
    });
  });

  describe('requestPasswordReset', () => {
    test('returns message when user not found', async () => {
      User.findOne.mockResolvedValue(null);
      const res = await AuthService.requestPasswordReset('no@no.com');
      expect(res.message).toMatch(/If this email exists/);
    });

    test('throws when provider not local', async () => {
      User.findOne.mockResolvedValue({ provider: 'google' });
      await expect(AuthService.requestPasswordReset('a@b.com')).rejects.toThrow('linked with');
    });

    test('rolls back when sendOTPEmail fails', async () => {
      const user = { save: jest.fn(), provider: 'local' };
      User.findOne.mockResolvedValue(user);
      jest.spyOn(otpUtil, 'generateOTPData').mockResolvedValue({ otp: '123', hashedOTP: 'h', expiry: Date.now() + 10000 });
      jest.spyOn(emailService, 'sendOTPEmail').mockRejectedValue(new Error('send fail'));

      await expect(AuthService.requestPasswordReset('a@b.com')).rejects.toThrow('Failed to send OTP email');
      expect(user.resetPasswordOTP).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    test('succeeds and sends otp', async () => {
      const user = { save: jest.fn(), provider: 'local' };
      User.findOne.mockResolvedValue(user);
      jest.spyOn(otpUtil, 'generateOTPData').mockResolvedValue({ otp: '123', hashedOTP: 'h', expiry: Date.now() + 10000 });
      jest.spyOn(emailService, 'sendOTPEmail').mockResolvedValue(true);

      const res = await AuthService.requestPasswordReset('a@b.com');
      expect(res.message).toMatch(/OTP sent/);
      expect(user.resetPasswordOTP).toBeDefined();
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('verifyOTPService', () => {
    test('throws for missing user', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(AuthService.verifyOTPService('a@b.com', '1')).rejects.toThrow('Invalid credentials');
    });

    test('throws when provider not local', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ provider: 'google' }) });
      await expect(AuthService.verifyOTPService('a@b.com', '1')).rejects.toThrow('Google');
    });

    test('throws when no otp request', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ provider: 'local', resetPasswordOTP: null, resetPasswordOTPExpires: null }) });
      await expect(AuthService.verifyOTPService('a@b.com', '1')).rejects.toThrow('No OTP request');
    });

    test('throws when otp expired', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() - 1000, save: jest.fn() };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(true);
      await expect(AuthService.verifyOTPService('a@b.com', '1')).rejects.toThrow('OTP has expired');
      expect(user.resetPasswordOTP).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    test('throws when invalid otp', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() + 1000 };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(false);
      jest.spyOn(otpUtil, 'verifyOTP').mockResolvedValue(false);
      await expect(AuthService.verifyOTPService('a@b.com', '1')).rejects.toThrow('Invalid OTP');
    });

    test('verifies otp successfully', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() + 1000, save: jest.fn(), email: 'a@b.com' };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(false);
      jest.spyOn(otpUtil, 'verifyOTP').mockResolvedValue(true);

      const res = await AuthService.verifyOTPService('a@b.com', '1');
      expect(res.verified).toBe(true);
      expect(user.resetPasswordOTPVerified).toBe(true);
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    test('throws for missing user', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(AuthService.resetPassword('a@b.com', '1', 'new')).rejects.toThrow('Invalid credentials');
    });

    test('throws when provider not local', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ provider: 'google' }) });
      await expect(AuthService.resetPassword('a@b.com', '1', 'new')).rejects.toThrow('Google');
    });

    test('throws when called without otp and not verified', async () => {
      const user = { provider: 'local', resetPasswordOTPVerified: false };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      await expect(AuthService.resetPassword('a@b.com', null, 'new')).rejects.toThrow('No OTP request');
    });

    test('throws when otp expired during reset', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() - 1000, save: jest.fn() };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(true);
      await expect(AuthService.resetPassword('a@b.com', '1', 'new')).rejects.toThrow('OTP has expired');
      expect(user.resetPasswordOTP).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    test('throws when invalid otp during reset', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() + 1000 };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(false);
      jest.spyOn(otpUtil, 'verifyOTP').mockResolvedValue(false);
      await expect(AuthService.resetPassword('a@b.com', '1', 'new')).rejects.toThrow('Invalid OTP');
    });

    test('resets password and handles email failure gracefully', async () => {
      const user = { provider: 'local', resetPasswordOTP: 'h', resetPasswordOTPExpires: Date.now() + 1000, save: jest.fn(), name: 'NAME' };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      jest.spyOn(otpUtil, 'isOTPExpired').mockReturnValue(false);
      jest.spyOn(otpUtil, 'verifyOTP').mockResolvedValue(true);
      jest.spyOn(emailService, 'sendPasswordResetConfirmation').mockRejectedValue(new Error('boom'));
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await AuthService.resetPassword('a@b.com', '1', 'new-pass');
      expect(res.message).toMatch(/Password reset successfully/);
      expect(user.password).toBe('new-pass');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});