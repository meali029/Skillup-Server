import Freelancer from '../models/Freelancer.js';

class FreelancerRepository {
  async findByUserId(userId) {
    return await Freelancer.findOne({ userId })
      .populate({
        path: 'proposals',
        options: { sort: { createdAt: -1 }, limit: 10 }
      })
      .populate({
        path: 'ongoingProjects',
        options: { sort: { createdAt: -1 } }
      });
  }

  async findById(id) {
    return await Freelancer.findById(id);
  }

  async create(data) {
    return await Freelancer.create(data);
  }

  async update(id, data) {
    return await Freelancer.findByIdAndUpdate(id, data, { new: true });
  }
}

export default new FreelancerRepository();
