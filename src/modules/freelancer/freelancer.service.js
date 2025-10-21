import freelancerRepository from '../../repositories/freelancer.repository.js';
import jobRepository from '../../repositories/job.repository.js';
import proposalRepository from '../../repositories/proposal.repository.js';

class FreelancerService {
  async getFreelancerProfile(userId) {
    const freelancer = await freelancerRepository.findByUserId(userId);
    
    if (!freelancer) {
      throw new Error('Freelancer profile not found');
    }

    const proposalCount = await proposalRepository.countByFreelancerId(freelancer._id);

    return {
      ...freelancer.toObject(),
      stats: {
        totalProposals: proposalCount,
        ongoingProjects: freelancer.ongoingProjects.length,
        averageRating: this.calculateAverageRating(freelancer.reviews)
      }
    };
  }

  async getRecommendedJobs(userId) {
    const freelancer = await freelancerRepository.findByUserId(userId);
    
    if (!freelancer) {
      throw new Error('Freelancer profile not found');
    }

    const skills = freelancer.skills.length > 0 ? freelancer.skills : ['general'];
    const jobs = await jobRepository.findRecommended(skills, 10);

    return jobs;
  }

  async getFreelancerProposals(freelancerId) {
    const proposals = await proposalRepository.findByFreelancerId(freelancerId, 10);
    return proposals;
  }

  calculateAverageRating(reviews) {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }
}

export default new FreelancerService();
