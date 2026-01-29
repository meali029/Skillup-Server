import { calculateProfileCompleteness } from '../../profile/profile.service.js';

export const formatUser = (user) => {
  if (!user) return null;

  const formattedUser = {
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isProfileComplete: user.isProfileComplete,
    // CRITICAL: Include email verification status for auth flow
    isEmailVerified: user.isEmailVerified || false,
    provider: user.provider,
  };

  // Include adminRole for admin users
  if (user.role === 'admin' && user.adminRole) {
    formattedUser.adminRole = user.adminRole;
  }

  if (user.bio) formattedUser.bio = user.bio;
  if (user.location) formattedUser.location = user.location;
  if (user.phone) formattedUser.phone = user.phone;

  if (user.role === 'freelancer') {
    formattedUser.skills = user.skills || [];
    formattedUser.hourlyRate = user.hourlyRate;
    formattedUser.experience = user.experience;
    formattedUser.portfolioUrl = user.portfolioUrl;
    formattedUser.portfolio = user.portfolio || [];
    formattedUser.availability = user.availability;
    formattedUser.languages = user.languages || [];
    formattedUser.website = user.website;
    // Include rating for freelancers
    formattedUser.rating = user.rating || { average: 0, count: 0 };
  }

  if (user.role === 'client') {
    formattedUser.companyName = user.companyName;
    formattedUser.companySize = user.companySize;
    formattedUser.industry = user.industry;
    // Include rating for clients
    formattedUser.rating = user.rating || { average: 0, count: 0 };
  }

  formattedUser.createdAt = user.createdAt;

  // CNIC Verification Status (exclude sensitive data like CNIC number and images)
  if (user.cnicVerificationStatus) {
    formattedUser.cnicVerificationStatus = user.cnicVerificationStatus;
    if (user.cnicVerifiedAt) formattedUser.cnicVerifiedAt = user.cnicVerifiedAt;
    if (user.cnicRejectionReason) formattedUser.cnicRejectionReason = user.cnicRejectionReason;
    if (user.cnicSubmittedAt) formattedUser.cnicSubmittedAt = user.cnicSubmittedAt;
  }

  // Profile Completeness (calculated dynamically for freelancers and clients)
  const profileCompleteness = calculateProfileCompleteness(user);
  if (profileCompleteness) {
    formattedUser.profileCompleteness = profileCompleteness;
  }

  return formattedUser;
};

export const formatUserMinimal = (user) => {
  if (!user) return null;
  
  return {
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar
  };
};

export default formatUser;
