import User from '../../models/User.js';
import Job from '../../models/Job.js';

class FreelancerService {
  async getFreelancerProfile(userId) {
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role !== 'freelancer') {
      throw new Error('User is not a freelancer');
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      location: user.location,
      phone: user.phone,
      skills: user.skills || [],
      hourlyRate: user.hourlyRate,
      experience: user.experience,
      portfolio: user.portfolio || [],
      isProfileComplete: user.isProfileComplete,
      stats: {
        totalProposals: 0, // TODO: Calculate from Proposal model when available
        ongoingProjects: 0, // TODO: Calculate from projects
        averageRating: 0 // TODO: Calculate from reviews
      }
    };
  }

  async getRecommendedJobs(userId) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role !== 'freelancer') {
      throw new Error('User is not a freelancer');
    }

    // Get user's skills or use empty array
    const userSkills = user.skills || [];

    // Build query
    const query = {
      status: 'open',
      isActive: true,
      deletedAt: null
    };

    // If user has skills, match jobs with those skills
    if (userSkills.length > 0) {
      query.skills = { $in: userSkills };
    }

    // Find recommended jobs
    const jobs = await Job.find(query)
      .populate('client', 'name avatar companyName')
      .sort({ createdAt: -1 })
      .limit(10);

    return jobs;
  }

  async getFreelancerProposals(freelancerId) {
    // TODO: Implement when Proposal model is created
    // For now, return empty array
    return [];
  }

  calculateAverageRating(reviews) {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }
}

export default new FreelancerService();
