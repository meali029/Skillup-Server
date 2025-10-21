import Job from '../models/Job.js';

class JobRepository {
  async findRecommended(skills, limit = 10) {
    return await Job.find({
      status: 'active',
      skillsRequired: { $in: skills }
    })
      .populate('postedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findById(id) {
    return await Job.findById(id).populate('postedBy', 'name email');
  }

  async findAll(filters = {}, limit = 20) {
    return await Job.find({ ...filters, status: 'active' })
      .populate('postedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

export default new JobRepository();
