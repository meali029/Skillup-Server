import User from '../../models/User.js';
import { TokenService } from '../../modules/shared/services/index.js';

/**
 * Create a test user in the database
 */
export const createTestUser = async (userData = {}) => {
  const defaultUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    provider: 'local',
    role: 'freelancer',
    skills: ['JavaScript', 'Node.js'],
    hourlyRate: 50,
    experience: 'intermediate',
    isProfileComplete: true,
  };

  const user = await User.create({ ...defaultUser, ...userData });
  return user;
};

/**
 * Create a test freelancer user
 */
export const createTestFreelancer = async (userData = {}) => {
  return createTestUser({
    role: 'freelancer',
    skills: ['JavaScript', 'React', 'Node.js'],
    hourlyRate: 60,
    experience: 'expert',
    isProfileComplete: true,
    ...userData,
  });
};

/**
 * Create a test client user
 */
export const createTestClient = async (userData = {}) => {
  return createTestUser({
    role: 'client',
    companyName: 'Test Company',
    companySize: '11-50',
    industry: 'Technology',
    isProfileComplete: true,
    skills: undefined,
    hourlyRate: undefined,
    experience: undefined,
    ...userData,
  });
};

/**
 * Generate auth token for testing
 */
export const generateTestToken = (user) => {
  return TokenService.generateToken(user);
};

/**
 * Create headers with auth token
 */
export const getAuthHeaders = (token) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Clear all test data
 */
export const clearTestData = async () => {
  await User.deleteMany({});
};

/**
 * Wait for a specified time (for async operations)
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
