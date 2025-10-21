import freelancerService from './freelancer.service.js';

class FreelancerController {
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const profile = await freelancerService.getFreelancerProfile(userId);
      
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getRecommendedJobs(req, res) {
    try {
      const userId = req.user.id;
      const jobs = await freelancerService.getRecommendedJobs(userId);
      
      res.status(200).json({
        success: true,
        data: jobs
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProposals(req, res) {
    try {
      const { freelancerId } = req.params;
      const proposals = await freelancerService.getFreelancerProposals(freelancerId);
      
      res.status(200).json({
        success: true,
        data: proposals
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new FreelancerController();
