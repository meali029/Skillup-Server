/**
 * User Data Transfer Object
 * Formats user data for API responses (excludes sensitive info)
 */
class UserDTO {
  constructor(user) {
    this.id = user._id || user.id;
    this.name = user.name;
    this.email = user.email;
    this.role = user.role;
    this.avatar = user.avatar;
    this.isProfileComplete = user.isProfileComplete;
    this.provider = user.provider;
    
    // Optional fields
    if (user.bio) this.bio = user.bio;
    if (user.location) this.location = user.location;
    if (user.phone) this.phone = user.phone;
    
    // Freelancer-specific fields
    if (user.role === 'freelancer') {
      this.skills = user.skills || [];
      this.hourlyRate = user.hourlyRate;
      this.experience = user.experience;
      this.portfolioUrl = user.portfolioUrl;
    }
    
    // Client-specific fields
    if (user.role === 'client') {
      this.companyName = user.companyName;
      this.companySize = user.companySize;
      this.industry = user.industry;
    }

    this.createdAt = user.createdAt;
  }

  /**
   * Create a minimal user response (for lists, etc.)
   */
  static minimal(user) {
    return {
      id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    };
  }
}

export default UserDTO;
