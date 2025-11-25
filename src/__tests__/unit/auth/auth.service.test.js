import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  registerLocal,
  loginLocal,
  completeProfile,
  requestPasswordReset,
  verifyOTPService,
  resetPassword,
} from '../../../modules/auth/auth.service.js';
import User from '../../../models/User.js';
import { AppError } from '../../../core/errors/index.js';
import { createTestUser, createTestFreelancer } from '../../helpers/testHelpers.js';

describe('Auth Service Unit Tests', () => {
  
  // Unit Test 1: Register with valid data
  describe('registerLocal', () => {
    test('should successfully register a new user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'freelancer',
        skills: ['JavaScript', 'React'],
        hourlyRate: 50,
        experience: 'intermediate',
      };

      const result = await registerLocal(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.email).toBe('john@example.com');
      expect(result.user.name).toBe('John Doe');
      expect(result.user.role).toBe('freelancer');
      expect(result.user.isProfileComplete).toBe(true);
      expect(result.token).toBeTruthy();
    });

    // Unit Test 2: Register with duplicate email
    test('should throw error when registering with duplicate email', async () => {
      await createTestUser({ email: 'duplicate@example.com' });

      const userData = {
        name: 'Another User',
        email: 'duplicate@example.com',
        password: 'password123',
      };

      await expect(registerLocal(userData)).rejects.toThrow('Email already registered');
    });

    // Unit Test 3: Register incomplete profile
    test('should register user with incomplete profile when required fields missing', async () => {
      const userData = {
        name: 'Incomplete User',
        email: 'incomplete@example.com',
        password: 'password123',
        role: 'freelancer',
        // Missing skills, hourlyRate, experience
      };

      const result = await registerLocal(userData);

      expect(result.user.isProfileComplete).toBe(false);
      expect(result.user.role).toBe('freelancer');
    });
  });

  // Unit Test 4: Login with valid credentials
  describe('loginLocal', () => {
    test('should successfully login with valid credentials', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        password: 'password123',
      });

      const result = await loginLocal({
        email: 'login@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.email).toBe('login@example.com');
      expect(result.user.password).toBeUndefined(); // Password should not be in response
      expect(result.token).toBeTruthy();
    });

    // Unit Test 5: Login with invalid password
    test('should throw error when logging in with invalid password', async () => {
      await createTestUser({
        email: 'wrongpass@example.com',
        password: 'correctpassword',
      });

      await expect(
        loginLocal({
          email: 'wrongpass@example.com',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid credentials');
    });

    // Unit Test 6: Login with non-existent email
    test('should throw error when logging in with non-existent email', async () => {
      await expect(
        loginLocal({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
      ).rejects.toThrow();
    });
  });

  // Unit Test 7: Complete profile for freelancer
  describe('completeProfile', () => {
    test('should successfully complete profile for freelancer', async () => {
      const user = await createTestUser({
        email: 'incomplete.freelancer@example.com',
        role: undefined,
        skills: [],
        hourlyRate: undefined,
        experience: undefined,
        isProfileComplete: false,
      });

      const profileData = {
        role: 'freelancer',
        skills: ['JavaScript', 'Node.js', 'React'],
        hourlyRate: 75,
        experience: 'expert',
        bio: 'Experienced developer',
        location: 'Pakistan',
        phone: '+923001234567',
      };

      const result = await completeProfile(user._id, profileData);

      expect(result.role).toBe('freelancer');
      expect(result.skills).toEqual(expect.arrayContaining(['JavaScript', 'Node.js', 'React']));
      expect(result.hourlyRate).toBe(75);
      expect(result.experience).toBe('expert');
      expect(result.isProfileComplete).toBe(true);
      expect(result.bio).toBe('Experienced developer');
    });

    // Unit Test 8: Complete profile for client
    test('should successfully complete profile for client', async () => {
      const user = await createTestUser({
        email: 'incomplete.client@example.com',
        role: undefined,
        isProfileComplete: false,
      });

      const profileData = {
        role: 'client',
        companyName: 'Tech Corp',
        companySize: '51-200',
        industry: 'Software Development',
        bio: 'Growing tech company',
        location: 'Lahore, Pakistan',
      };

      const result = await completeProfile(user._id, profileData);

      expect(result.role).toBe('client');
      expect(result.companyName).toBe('Tech Corp');
      expect(result.companySize).toBe('51-200');
      expect(result.industry).toBe('Software Development');
      expect(result.isProfileComplete).toBe(true);
      // Freelancer fields should be cleared
      expect(result.skills).toEqual([]);
      expect(result.hourlyRate).toBeUndefined();
      expect(result.experience).toBeUndefined();
    });

    // Unit Test 9: Complete profile with invalid role
    test('should throw error when completing profile with invalid data', async () => {
      const user = await createTestUser({
        email: 'invalid.profile@example.com',
        isProfileComplete: false,
      });

      const profileData = {
        role: 'freelancer',
        // Missing required fields: skills, hourlyRate, experience
      };

      await expect(completeProfile(user._id, profileData)).rejects.toThrow();
    });
  });

  // Unit Test 10: Password reset OTP request
  describe('Password Reset Flow', () => {
    test('should successfully request password reset and send OTP', async () => {
      const user = await createTestUser({
        email: 'reset@example.com',
        provider: 'local',
      });

      const result = await requestPasswordReset('reset@example.com');

      expect(result).toHaveProperty('message');
      expect(result.message).toContain('OTP sent successfully');

      // Verify OTP was stored in database
      const updatedUser = await User.findById(user._id).select('+resetPasswordOTP +resetPasswordOTPExpires');
      expect(updatedUser.resetPasswordOTP).toBeTruthy();
      expect(updatedUser.resetPasswordOTPExpires).toBeTruthy();
      expect(new Date(updatedUser.resetPasswordOTPExpires) > new Date()).toBe(true);

      // Email service mock is not directly accessible in ES modules
      // This test validates OTP was stored, which indicates the flow worked
    });

    test('should throw error when requesting password reset for OAuth user', async () => {
      await createTestUser({
        email: 'google@example.com',
        provider: 'google',
      });

      await expect(requestPasswordReset('google@example.com')).rejects.toThrow('Google');
    });

    test('should handle non-existent email gracefully', async () => {
      const result = await requestPasswordReset('nonexistent@example.com');

      expect(result).toHaveProperty('message');
      expect(result.message).toContain('If this email exists');
      // Should not throw error for security reasons
    });
  });
});
