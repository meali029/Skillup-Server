import { describe, test, expect, beforeEach } from '@jest/globals';
import User from '../../../models/User.js';
import {
  registerLocal,
  completeProfile,
  requestPasswordReset,
  verifyOTPService,
  resetPassword,
} from '../../../modules/auth/auth.service.js';
import { createTestUser } from '../../helpers/testHelpers.js';
import { AppError } from '../../../core/errors/index.js';
import bcrypt from 'bcryptjs';

describe('Auth Business Logic Tests', () => {

  /**
   * Business Test 1: User Profile Completion Journey
   * Tests the complete user journey from registration with incomplete profile
   * to full profile completion, verifying profile state transitions
   */
  describe('Business Logic: User Profile Completion Journey', () => {
    test('should handle complete user onboarding journey from incomplete to complete profile', async () => {
      // Scenario: User registers with minimal info (just name, email, password)
      const registrationData = {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'securepass123',
      };

      // Step 1: Register with incomplete profile
      const registrationResult = await registerLocal(registrationData);
      
      expect(registrationResult.user.isProfileComplete).toBe(false);
      expect(registrationResult.user.role).toBeUndefined();
      expect(registrationResult.token).toBeTruthy();

      // Step 2: User decides to become a freelancer and completes profile
      const freelancerProfileData = {
        role: 'freelancer',
        skills: ['JavaScript', 'Node.js', 'MongoDB', 'React'],
        hourlyRate: 65,
        experience: 'intermediate',
        bio: 'Passionate web developer specializing in MERN stack',
        location: 'Karachi, Pakistan',
        phone: '+923012345678',
      };

      const completedProfile = await completeProfile(
        registrationResult.user._id,
        freelancerProfileData
      );

      // Verify profile is now complete
      expect(completedProfile.isProfileComplete).toBe(true);
      expect(completedProfile.role).toBe('freelancer');
      expect(completedProfile.skills).toHaveLength(4);
      expect(completedProfile.hourlyRate).toBe(65);
      expect(completedProfile.experience).toBe('intermediate');

      // Step 3: Verify profile completion persistence
      const userFromDb = await User.findById(registrationResult.user._id);
      expect(userFromDb.isProfileComplete).toBe(true);
      expect(userFromDb.checkProfileComplete()).toBe(true);

      // Step 4: Attempt to change role to client (business rule: role switch)
      const clientProfileData = {
        role: 'client',
        companyName: 'Tech Innovations',
        companySize: '11-50',
        industry: 'Software Development',
        bio: 'Growing software company',
      };

      const switchedProfile = await completeProfile(
        registrationResult.user._id,
        clientProfileData
      );

      // Verify role switch clears freelancer-specific fields
      expect(switchedProfile.role).toBe('client');
      expect(switchedProfile.companyName).toBe('Tech Innovations');
      expect(switchedProfile.skills).toEqual([]); // Cleared
      expect(switchedProfile.hourlyRate).toBeUndefined(); // Cleared
      expect(switchedProfile.experience).toBeUndefined(); // Cleared
      expect(switchedProfile.isProfileComplete).toBe(true);
    });

    test('should enforce profile completion requirements for each role', async () => {
      const user = await createTestUser({
        email: 'requirements@example.com',
        role: undefined,
        isProfileComplete: false,
      });

      // Test 1: Freelancer with missing hourlyRate
      await expect(
        completeProfile(user._id, {
          role: 'freelancer',
          skills: ['JavaScript'],
          experience: 'beginner',
          // Missing hourlyRate
        })
      ).rejects.toThrow();

      // Test 2: Freelancer with missing skills
      await expect(
        completeProfile(user._id, {
          role: 'freelancer',
          skills: [], // Empty array
          hourlyRate: 50,
          experience: 'beginner',
        })
      ).rejects.toThrow('At least one skill is required');

      // Test 3: Freelancer with missing experience
      await expect(
        completeProfile(user._id, {
          role: 'freelancer',
          skills: ['Python'],
          hourlyRate: 60,
          // Missing experience
        })
      ).rejects.toThrow();

      // Test 4: Client with missing companyName
      await expect(
        completeProfile(user._id, {
          role: 'client',
          companySize: '11-50',
          industry: 'Technology',
          // Missing companyName
        })
      ).rejects.toThrow('Company name is required');

      // Test 5: Client with missing companySize
      await expect(
        completeProfile(user._id, {
          role: 'client',
          companyName: 'Tech Corp',
          industry: 'Technology',
          // Missing companySize
        })
      ).rejects.toThrow('Company size is required');

      // Test 6: Successful completion with all required fields
      const validProfile = await completeProfile(user._id, {
        role: 'freelancer',
        skills: ['Go', 'Kubernetes', 'AWS'],
        hourlyRate: 100,
        experience: 'expert',
      });

      expect(validProfile.isProfileComplete).toBe(true);
    });
  });

  /**
   * Business Test 2: Secure Password Reset Workflow
   * Tests the complete password reset business flow including OTP generation,
   * verification, expiration, and security validations
   */
  describe('Business Logic: Secure Password Reset Workflow', () => {
    test('should handle complete password reset flow with security validations', async () => {
      // Setup: Create user with local provider
      const user = await createTestUser({
        email: 'secureuser@example.com',
        password: 'oldSecurePassword123',
        provider: 'local',
      });

      // Business Rule 1: Request password reset
      const resetRequest = await requestPasswordReset('secureuser@example.com');
      expect(resetRequest.message).toContain('OTP sent successfully');

      // Verify OTP stored in database (hashed)
      const userWithOTP = await User.findById(user._id)
        .select('+resetPasswordOTP +resetPasswordOTPExpires');
      
      expect(userWithOTP.resetPasswordOTP).toBeTruthy();
      expect(userWithOTP.resetPasswordOTPExpires).toBeTruthy();
      
      // Business Rule 2: OTP should expire after set time
      const expiryTime = new Date(userWithOTP.resetPasswordOTPExpires);
      const now = new Date();
      const timeDiff = (expiryTime - now) / 1000 / 60; // in minutes
      
      expect(timeDiff).toBeGreaterThan(9); // Should be ~10 minutes
      expect(timeDiff).toBeLessThan(11);

      // Business Rule 3: Generate valid OTP for testing
      const testOTP = '567890';
      const hashedOTP = await bcrypt.hash(testOTP, 10);
      
      userWithOTP.resetPasswordOTP = hashedOTP;
      await userWithOTP.save();

      // Business Rule 4: Verify OTP successfully
      const verifyResult = await verifyOTPService('secureuser@example.com', testOTP);
      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.message).toContain('verified successfully');

      // Business Rule 5: Reset password with verified OTP
      const resetResult = await resetPassword(
        'secureuser@example.com',
        testOTP,
        'newSecurePassword456'
      );

      expect(resetResult.message).toContain('Password reset successfully');

      // Business Rule 6: Verify OTP cleared after successful reset
      const userAfterReset = await User.findById(user._id)
        .select('+resetPasswordOTP +resetPasswordOTPExpires');
      
      expect(userAfterReset.resetPasswordOTP).toBeUndefined();
      expect(userAfterReset.resetPasswordOTPExpires).toBeUndefined();

      // Business Rule 7: Verify new password works
      const userWithPassword = await User.findById(user._id).select('+password');
      const isNewPasswordValid = await userWithPassword.comparePassword('newSecurePassword456');
      expect(isNewPasswordValid).toBe(true);

      // Business Rule 8: Verify old password no longer works
      const isOldPasswordValid = await userWithPassword.comparePassword('oldSecurePassword123');
      expect(isOldPasswordValid).toBe(false);

      // Business Rule 9: Cannot reuse the same OTP after password reset
      await expect(
        resetPassword('secureuser@example.com', testOTP, 'anotherPassword')
      ).rejects.toThrow('No OTP request found');
    });

    test('should enforce security rules for password reset', async () => {
      const user = await createTestUser({
        email: 'security@example.com',
        password: 'currentpass',
        provider: 'local',
      });

      // Security Rule 1: Cannot reset password for OAuth users
      const oauthUser = await createTestUser({
        email: 'oauth@example.com',
        provider: 'google',
      });

      await expect(requestPasswordReset('oauth@example.com')).rejects.toThrow('Google');

      // Security Rule 2: Cannot verify OTP without requesting reset first
      await expect(
        verifyOTPService('security@example.com', '123456')
      ).rejects.toThrow('No OTP request found');

      // Security Rule 3: Request reset and test invalid OTP
      await requestPasswordReset('security@example.com');
      
      const validOTP = '789012';
      const hashedValidOTP = await bcrypt.hash(validOTP, 10);
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 10);
      
      user.resetPasswordOTP = hashedValidOTP;
      user.resetPasswordOTPExpires = expiry;
      await user.save();

      await expect(
        verifyOTPService('security@example.com', '999999') // Wrong OTP
      ).rejects.toThrow('Invalid OTP');

      // Security Rule 4: Test expired OTP
      const expiredUser = await createTestUser({
        email: 'expired@example.com',
        password: 'pass123',
        provider: 'local',
      });

      const expiredOTP = '111111';
      const hashedExpiredOTP = await bcrypt.hash(expiredOTP, 10);
      const expiredTime = new Date();
      expiredTime.setMinutes(expiredTime.getMinutes() - 1); // Already expired
      
      expiredUser.resetPasswordOTP = hashedExpiredOTP;
      expiredUser.resetPasswordOTPExpires = expiredTime;
      await expiredUser.save();

      await expect(
        verifyOTPService('expired@example.com', expiredOTP)
      ).rejects.toThrow('OTP has expired');

      // Verify expired OTP is cleared from database
      const clearedUser = await User.findById(expiredUser._id)
        .select('+resetPasswordOTP +resetPasswordOTPExpires');
      
      expect(clearedUser.resetPasswordOTP).toBeUndefined();
      expect(clearedUser.resetPasswordOTPExpires).toBeUndefined();
    });
  });

  /**
   * Business Test 3: Multi-Role User Management
   * Tests business rules around user roles, permissions, and role-specific
   * data management (freelancer vs client)
   */
  describe('Business Logic: Multi-Role User Management', () => {
    test('should manage role-specific data correctly for different user types', async () => {
      // Scenario 1: Freelancer-specific business logic
      const freelancerData = {
        name: 'Expert Developer',
        email: 'expert.dev@example.com',
        password: 'pass123',
        role: 'freelancer',
        skills: ['React', 'Node.js', 'AWS', 'Docker', 'MongoDB'],
        hourlyRate: 150,
        experience: 'expert',
        bio: 'Senior full-stack developer with cloud expertise',
        location: 'Lahore, Pakistan',
      };

      const freelancer = await registerLocal(freelancerData);

      // Business Rule 1: Freelancer profile complete with required fields
      expect(freelancer.user.isProfileComplete).toBe(true);
      expect(freelancer.user.role).toBe('freelancer');
      expect(freelancer.user.skills).toHaveLength(5);
      expect(freelancer.user.hourlyRate).toBe(150);
      
      // Business Rule 2: Freelancer should not have client fields
      expect(freelancer.user.companyName).toBeUndefined();
      expect(freelancer.user.companySize).toBeUndefined();
      expect(freelancer.user.industry).toBeUndefined();

      // Business Rule 3: Freelancer has default job statistics
      const freelancerFromDb = await User.findById(freelancer.user._id);
      expect(freelancerFromDb.appliedJobsCount).toBe(0);
      expect(freelancerFromDb.activeProposalsCount).toBe(0);
      expect(freelancerFromDb.completedJobsCount).toBe(0);
      expect(freelancerFromDb.totalEarnings).toBe(0);

      // Scenario 2: Client-specific business logic
      const clientData = {
        name: 'Business Owner',
        email: 'business@example.com',
        password: 'secure456',
        role: 'client',
        companyName: 'Tech Innovations Ltd',
        companySize: '51-200',
        industry: 'Financial Technology',
        bio: 'Leading fintech company in Pakistan',
        location: 'Islamabad, Pakistan',
      };

      const client = await registerLocal(clientData);

      // Business Rule 4: Client profile complete with required fields
      expect(client.user.isProfileComplete).toBe(true);
      expect(client.user.role).toBe('client');
      expect(client.user.companyName).toBe('Tech Innovations Ltd');
      expect(client.user.companySize).toBe('51-200');
      expect(client.user.industry).toBe('Financial Technology');

      // Business Rule 5: Client should not have freelancer fields
      expect(client.user.skills).toEqual([]);
      expect(client.user.hourlyRate).toBeUndefined();
      expect(client.user.experience).toBeUndefined();

      // Business Rule 6: Client has default job statistics
      const clientFromDb = await User.findById(client.user._id);
      expect(clientFromDb.postedJobsCount).toBe(0);
      expect(clientFromDb.activeJobsCount).toBe(0);
      expect(clientFromDb.totalSpent).toBe(0);

      // Business Rule 7: Cannot have both role types simultaneously
      // When switching role, previous role data is cleared
      const switchedUser = await completeProfile(freelancer.user._id, {
        role: 'client',
        companyName: 'New Venture',
        companySize: '1-10',
        industry: 'E-commerce',
      });

      expect(switchedUser.role).toBe('client');
      expect(switchedUser.companyName).toBe('New Venture');
      expect(switchedUser.skills).toEqual([]); // Freelancer data cleared
      expect(switchedUser.hourlyRate).toBeUndefined();
      expect(switchedUser.experience).toBeUndefined();
    });

    test('should validate profile completeness based on role requirements', async () => {
      // Test profile completeness checker for different scenarios
      
      // Scenario 1: Complete freelancer profile
      const completeFreelancer = await createTestUser({
        email: 'complete.freelancer@example.com',
        role: 'freelancer',
        skills: ['Python', 'Django'],
        hourlyRate: 70,
        experience: 'intermediate',
      });

      expect(completeFreelancer.checkProfileComplete()).toBe(true);
      expect(completeFreelancer.isProfileComplete).toBe(true);

      // Scenario 2: Incomplete freelancer (missing skills)
      const incompleteFreelancer1 = await createTestUser({
        email: 'incomplete1@example.com',
        role: 'freelancer',
        skills: [],
        hourlyRate: 50,
        experience: 'beginner',
        isProfileComplete: false,
      });

      expect(incompleteFreelancer1.checkProfileComplete()).toBe(false);

      // Scenario 3: Incomplete freelancer (missing hourlyRate)
      const incompleteFreelancer2 = new User({
        name: 'Test',
        email: 'incomplete2@example.com',
        password: 'pass',
        role: 'freelancer',
        skills: ['Java'],
        experience: 'beginner',
      });

      expect(incompleteFreelancer2.checkProfileComplete()).toBe(false);

      // Scenario 4: Complete client profile
      const completeClient = await createTestUser({
        email: 'complete.client@example.com',
        role: 'client',
        companyName: 'ABC Corp',
        companySize: '11-50',
        industry: 'Healthcare',
      });

      expect(completeClient.checkProfileComplete()).toBe(true);
      expect(completeClient.isProfileComplete).toBe(true);

      // Scenario 5: Incomplete client (missing industry)
      const incompleteClient = new User({
        name: 'Business User',
        email: 'incomplete.client@example.com',
        password: 'pass',
        role: 'client',
        companyName: 'XYZ Ltd',
        companySize: '1-10',
      });

      expect(incompleteClient.checkProfileComplete()).toBe(false);

      // Scenario 6: User without role
      const noRole = new User({
        name: 'No Role User',
        email: 'norole@example.com',
        password: 'pass',
      });

      expect(noRole.checkProfileComplete()).toBe(false);
    });
  });
});
