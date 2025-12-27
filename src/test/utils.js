import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Create a test user
export const createTestUser = async (userData = {}) => {
  const defaultUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'freelancer',
    isProfileComplete: true,
    skills: ['React', 'Node.js'],
    hourlyRate: 50,
    experience: 'intermediate',
    ...userData,
  };

  return await User.create(defaultUser);
};

// Create a test client
export const createTestClient = async (userData = {}) => {
  const defaultClient = {
    name: 'Test Client',
    email: 'client@example.com',
    password: 'password123',
    role: 'client',
    isProfileComplete: true,
    companyName: 'Test Company',
    companySize: '11-50',
    industry: 'Technology',
    ...userData,
  };

  return await User.create(defaultClient);
};

// Create a test admin
export const createTestAdmin = async (userData = {}) => {
  const defaultAdmin = {
    name: 'Test Admin',
    email: 'admin@example.com',
    password: 'password123',
    role: 'admin',
    adminRole: 'admin',
    isProfileComplete: true,
    ...userData,
  };

  return await User.create(defaultAdmin);
};

// Generate a test JWT token
export const generateTestToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only',
    { expiresIn: '7d' }
  );
};

// Create authenticated request headers
export const createAuthHeaders = (user) => {
  const token = generateTestToken(user);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

// Create authenticated cookie
export const createAuthCookie = (user) => {
  const token = generateTestToken(user);
  return `token=${token}`;
};

// Wait for async operations
export const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
