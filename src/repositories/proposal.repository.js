import Proposal from '../models/Proposal.js';

class ProposalRepository {
  async findByFreelancerId(freelancerId, limit = 10) {
    return await Proposal.find({ freelancerId })
      .populate('jobId')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async create(data) {
    return await Proposal.create(data);
  }

  async findById(id) {
    return await Proposal.findById(id);
  }

  async update(id, data) {
    return await Proposal.findByIdAndUpdate(id, data, { new: true });
  }

  async countByFreelancerId(freelancerId) {
    return await Proposal.countDocuments({ freelancerId });
  }
}

export default new ProposalRepository();
