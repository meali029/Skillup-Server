import { describe, it, expect, beforeEach } from '@jest/globals';
import User from '../../models/User.js';

describe('User Model', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    it('should create a new user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'freelancer',
      };

      const user = await User.create(userData);
      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('freelancer');
    });

    it('should hash password on creation', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(user.password).not.toBe('password123');
      expect(user.password).toBeDefined();
    });

    it('should require unique email', async () => {
      await User.create({
        name: 'User 1',
        email: 'test@example.com',
        password: 'password123',
      });

      await expect(
        User.create({
          name: 'User 2',
          email: 'test@example.com',
          password: 'password123',
        })
      ).rejects.toThrow();
    });
  });

  describe('Password Methods', () => {
    it('should compare password correctly', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      const isValid = await user.comparePassword('password123');
      expect(isValid).toBe(true);

      const isInvalid = await user.comparePassword('wrongpassword');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Profile Completion', () => {
    it('should check freelancer profile completion', async () => {
      const incompleteUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'freelancer',
      });

      expect(incompleteUser.checkProfileComplete()).toBe(false);

      incompleteUser.skills = ['React'];
      incompleteUser.hourlyRate = 50;
      incompleteUser.experience = 'intermediate';
      expect(incompleteUser.checkProfileComplete()).toBe(true);
    });

    it('should check client profile completion', async () => {
      const incompleteUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'client',
      });

      expect(incompleteUser.checkProfileComplete()).toBe(false);

      incompleteUser.companyName = 'Test Company';
      incompleteUser.companySize = '11-50';
      incompleteUser.industry = 'Technology';
      expect(incompleteUser.checkProfileComplete()).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate auth token', async () => {
      process.env.JWT_SECRET = 'test-secret';
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'freelancer',
      });

      const token = user.generateAuthToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('Admin Role Validation', () => {
    it('should require adminRole for admin users', async () => {
      await expect(
        User.create({
          name: 'Admin',
          email: 'admin@example.com',
          password: 'password123',
          role: 'admin',
          // Missing adminRole
        })
      ).rejects.toThrow();
    });

    it('should clear adminRole for non-admin users', async () => {
      const user = await User.create({
        name: 'User',
        email: 'user@example.com',
        password: 'password123',
        role: 'freelancer',
        adminRole: 'admin', // Should be cleared
      });

      expect(user.adminRole).toBeUndefined();
    });
  });
});