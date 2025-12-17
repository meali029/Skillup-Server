export const formatUser = (user) => {
  if (!user) return null;

  const formattedUser = {
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isProfileComplete: user.isProfileComplete,
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
  }

  if (user.role === 'client') {
    formattedUser.companyName = user.companyName;
    formattedUser.companySize = user.companySize;
    formattedUser.industry = user.industry;
  }

  formattedUser.createdAt = user.createdAt;

  // CNIC Verification Status (exclude sensitive data like CNIC number and images)
  if (user.cnicVerificationStatus) {
    formattedUser.cnicVerificationStatus = user.cnicVerificationStatus;
    if (user.cnicVerifiedAt) formattedUser.cnicVerifiedAt = user.cnicVerifiedAt;
    if (user.cnicRejectionReason) formattedUser.cnicRejectionReason = user.cnicRejectionReason;
    if (user.cnicSubmittedAt) formattedUser.cnicSubmittedAt = user.cnicSubmittedAt;
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
