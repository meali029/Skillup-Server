import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../app.js';
import { createTestUser, createTestFreelancer, generateTestToken } from '../../helpers/testHelpers.js';

describe('Auth Integration Tests', () => {

  // Integration Test 1: Complete registration flow
  describe('POST /api/auth/register', () => {
    test('should register a new freelancer user with complete profile', async () => {
      const userData = {
        name: 'Integration Test Freelancer',
        email: 'integration.freelancer@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'freelancer',
        skills: ['JavaScript', 'Python', 'React'],
        hourlyRate: 80,
        experience: 'expert',
        bio: 'Full-stack developer with 5 years experience',
        location: 'Karachi, Pakistan',
        phone: '+923001234567',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Registration successful');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('integration.freelancer@example.com');
      expect(response.body.data.user.role).toBe('freelancer');
      expect(response.body.data.user.isProfileComplete).toBe(true);
      expect(response.body.data.user.password).toBeUndefined();
      
      // Verify token is set in cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(cookie => cookie.startsWith('token='))).toBe(true);
    });

    test('should register a new client user with complete profile', async () => {
      const userData = {
        name: 'Integration Test Client',
        email: 'integration.client@example.com',
        password: 'securePass123',
        confirmPassword: 'securePass123',
        role: 'client',
        companyName: 'Tech Solutions Ltd',
        companySize: '51-200',
        industry: 'Information Technology',
        bio: 'Leading IT company in Pakistan',
        location: 'Islamabad, Pakistan',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe('client');
      expect(response.body.data.user.companyName).toBe('Tech Solutions Ltd');
      expect(response.body.data.user.isProfileComplete).toBe(true);
    });

    test('should return validation error for invalid data', async () => {
      const userData = {
        name: 'T', // Too short
        email: 'invalid-email', // Invalid email
        password: '123', // Too short
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toBeDefined();
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
  });

  // Integration Test 2: Complete login flow
  describe('POST /api/auth/login', () => {
    test('should successfully login with valid credentials', async () => {
      // Create a test user first
      await createTestUser({
        email: 'login.test@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login.test@example.com',
          password: 'password123',
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('login.test@example.com');
      
      // Verify token cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some(cookie => cookie.startsWith('token='))).toBe(true);
    });

    test('should return error for invalid credentials', async () => {
      await createTestUser({
        email: 'wrongpassword@example.com',
        password: 'correctpassword',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrongpassword@example.com',
          password: 'wrongpassword',
        })
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should return error for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'somepassword',
        })
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // Integration Test 3: Complete profile after partial registration
  describe('POST /api/auth/complete-profile', () => {
    test('should complete profile for authenticated user', async () => {
      // Create user with incomplete profile
      const user = await createTestUser({
        email: 'incomplete@example.com',
        role: undefined,
        skills: [],
        hourlyRate: undefined,
        experience: undefined,
        isProfileComplete: false,
      });

      const token = generateTestToken(user);

      const profileData = {
        role: 'freelancer',
        skills: ['Vue.js', 'TypeScript', 'Docker'],
        hourlyRate: 95,
        experience: 'expert',
        bio: 'Senior full-stack engineer',
        location: 'Lahore, Pakistan',
      };

      const response = await request(app)
        .post('/api/auth/complete-profile')
        .set('Authorization', `Bearer ${token}`)
        .send(profileData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile completed successfully');
      expect(response.body.data.user.isProfileComplete).toBe(true);
      expect(response.body.data.user.role).toBe('freelancer');
      expect(response.body.data.user.skills).toEqual(expect.arrayContaining(['Vue.js', 'TypeScript', 'Docker']));
      expect(response.body.data).toHaveProperty('token'); // New token with updated claims
    });

    test('should return error when not authenticated', async () => {
      const response = await request(app)
        .post('/api/auth/complete-profile')
        .send({
          role: 'freelancer',
          skills: ['JavaScript'],
          hourlyRate: 50,
          experience: 'beginner',
        })
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // Integration Test 4: Get current user (me endpoint)
  describe('GET /api/auth/me', () => {
    test('should return current user data when authenticated', async () => {
      const user = await createTestFreelancer({
        email: 'me.test@example.com',
      });

      const token = generateTestToken(user);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User retrieved successfully');
      expect(response.body.data.user.email).toBe('me.test@example.com');
      expect(response.body.data.user.role).toBe('freelancer');
      expect(response.body.data.user.password).toBeUndefined();
    });

    test('should return error when not authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // Integration Test 5: Password reset flow
  describe('Password Reset Flow', () => {
    test('should complete full password reset flow', async () => {
      // Step 1: Create a user
      const user = await createTestUser({
        email: 'resetflow@example.com',
        password: 'oldpassword123',
        provider: 'local',
      });

      // Step 2: Request password reset
      const requestResponse = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'resetflow@example.com' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(requestResponse.body.success).toBe(true);
      expect(requestResponse.body.message).toContain('OTP sent successfully');

      // Mock OTP for testing (in real scenario, this would be from email)
      const mockOTP = '123456';
      
      // Manually set a known OTP in the database for testing
      const bcrypt = await import('bcryptjs');
      const hashedOTP = await bcrypt.hash(mockOTP, 10);
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 10);
      
      user.resetPasswordOTP = hashedOTP;
      user.resetPasswordOTPExpires = expiry;
      await user.save();

      // Step 3: Verify OTP
      const verifyResponse = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: 'resetflow@example.com',
          otp: mockOTP,
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.data.verified).toBe(true);

      // Step 4: Reset password
      const resetResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'resetflow@example.com',
          otp: mockOTP,
          newPassword: 'newpassword456',
          confirmPassword: 'newpassword456',
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(resetResponse.body.success).toBe(true);
      expect(resetResponse.body.message).toContain('Password reset successfully');

      // Step 5: Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'resetflow@example.com',
          password: 'newpassword456',
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data).toHaveProperty('token');
    });

    test('should prevent password reset for OAuth users', async () => {
      await createTestUser({
        email: 'googleuser@example.com',
        provider: 'google',
      });

      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'googleuser@example.com' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Google');
    });
  });

  // Test logout functionality
  describe('POST /api/auth/logout', () => {
    test('should successfully logout user', async () => {
      const user = await createTestUser({ email: 'logout@example.com' });
      const token = generateTestToken(user);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
      
      // Verify token cookie is cleared
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });
  });
});
