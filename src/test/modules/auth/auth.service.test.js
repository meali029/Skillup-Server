import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  registerLocal,
  loginLocal,
  completeProfile,
  requestPasswordReset,
  verifyOTPService,
  resetPassword,
} from '../../../modules/auth/auth.service.js';
import User from '../../../models/User.js';

// Mock TokenService
jest.mock('../../../modules/shared/services/index.js', () => ({
  TokenService: { generateToken: jest.fn(() => 'test-token') }
}));

// Mock OTP utils and email functions
jest.mock('../../../core/utils/otpService.js', () => ({
  generateOTPData: jest.fn(async () => ({ otp: '123456', hashedOTP: 'hashed', expiry: Date.now() + 100000 })),
  verifyOTP: jest.fn(async () => true),
  isOTPExpired: jest.fn(() => false),
}));

jest.mock('../../../core/utils/emailService.js', () => ({
  sendOTPEmail: jest.fn(),
  sendPasswordResetConfirmation: jest.fn(),
}));

describe('Auth Service', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('registerLocal registers a new user and returns token', async () => {
    const res = await registerLocal({ name: 'R', email: 'r@example.com', password: 'pass1234', role: 'freelancer', skills: ['Node'], hourlyRate: 10, experience: 'intermediate' });
    expect(res.user).toBeDefined();
    expect(res.token).toBe('test-token');
  });

  it('loginLocal authenticates an existing user', async () => {
    await registerLocal({ name: 'L', email: 'l@example.com', password: 'pass1234' });
    const { user, token } = await loginLocal({ email: 'l@example.com', password: 'pass1234' });
    expect(user.email).toBe('l@example.com');
    expect(token).toBe('test-token');
  });

  it('requestPasswordReset stores OTP and sends email', async () => {
    await registerLocal({ name: 'P', email: 'p@example.com', password: 'pass1234' });
    const res = await requestPasswordReset('p@example.com');
    expect(res.message).toContain('OTP sent');
    const u = await User.findOne({ email: 'p@example.com' }).select('+resetPasswordOTP +resetPasswordOTPExpires');
    expect(u.resetPasswordOTP).toBeDefined();
  });

  it('verifyOTPService verifies otp and marks user flag', async () => {
    await registerLocal({ name: 'V', email: 'v@example.com', password: 'pass1234' });
    // simulate OTP fields
    const u = await User.findOne({ email: 'v@example.com' });
    u.resetPasswordOTP = 'hashed';
    u.resetPasswordOTPExpires = Date.now() + 100000;
    await u.save();

    const res = await verifyOTPService('v@example.com', '123456');
    expect(res.verified).toBe(true);
  });

  it('resetPassword works when OTP previously verified', async () => {
    await registerLocal({ name: 'Z', email: 'z@example.com', password: 'oldpass' });
    const u = await User.findOne({ email: 'z@example.com' });
    u.resetPasswordOTPVerified = true;
    await u.save();

    const res = await resetPassword('z@example.com', 'newpass');
    expect(res.message).toContain('Password reset');

    const updated = await User.findOne({ email: 'z@example.com' }).select('+password');
    // Password should be hashed and not equal to 'newpass'
    expect(updated.password).not.toBe('newpass');
  });

  it('completeProfile enforces validations and completes profile', async () => {
    const r = await registerLocal({ name: 'CP', email: 'cp@example.com', password: 'cp123' });
    const u = r.user;
    const saved = await completeProfile(u._id, { role: 'freelancer', skills: ['JS'], hourlyRate: 10, experience: 'intermediate' });
    expect(saved.isProfileComplete).toBe(true);
    expect(saved.skills.length).toBeGreaterThan(0);
  });
});