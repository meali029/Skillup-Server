import { generateOTP, hashOTP, verifyOTP, getOTPExpiry, isOTPExpired, generateOTPData } from '../../../core/utils/otpService.js';

describe('OTP service', () => {
  test('generateOTP returns 6-digit string', () => {
    const otp = generateOTP();
    expect(typeof otp).toBe('string');
    expect(otp).toHaveLength(6);
  });

  test('hash and verify OTP', async () => {
    const otp = '123456';
    const hashed = await hashOTP(otp);
    expect(typeof hashed).toBe('string');
    const ok = await verifyOTP(otp, hashed);
    expect(ok).toBe(true);
  });

  test('expiry functions', () => {
    const expiry = getOTPExpiry();
    expect(new Date(expiry) > new Date()).toBe(true);
    expect(isOTPExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  test('generateOTPData produces otp, hashedOTP and expiry', async () => {
    const data = await generateOTPData();
    expect(data.otp).toBeDefined();
    expect(data.hashedOTP).toBeDefined();
    expect(data.expiry).toBeDefined();
  });
});