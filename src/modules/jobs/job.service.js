import Job from '../../models/Job.js';

class JobService {
  // Create a new job
  async createJob(jobData, clientId) {
    try {
      const job = new Job({
        ...jobData,
        client: clientId,
      });
      
      await job.save();
      await job.populate('client', 'name email companyName');
      
      return job;
    } catch (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }
  }

  // Get all jobs with filters and pagination
  async getAllJobs(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sort = '-createdAt',
        category,
        budgetType,
        minBudget,
        maxBudget,
        experienceLevel,
        locationType,
        skills,
        search,
        status = 'open',
      } = { ...filters, ...options };

      // Build query
      const query = {
        status,
        isActive: true,
        deletedAt: null,
      };

      // Category filter
      if (category) {
        query.category = category;
      }

      // Budget filters
      if (budgetType) {
        query.budgetType = budgetType;
      }

      if (minBudget !== undefined || maxBudget !== undefined) {
        query.budgetAmount = {};
        if (minBudget !== undefined) query.budgetAmount.$gte = minBudget;
        if (maxBudget !== undefined) query.budgetAmount.$lte = maxBudget;
      }

      // Experience level filter
      if (experienceLevel) {
        query.experienceLevel = experienceLevel;
      }

      // Location type filter
      if (locationType) {
        query['location.type'] = locationType;
      }

      // Skills filter
      if (skills) {
        const skillArray = Array.isArray(skills) ? skills : [skills];
        query.skills = { $in: skillArray.map(s => s.toLowerCase()) };
      }

      // Text search
      if (search) {
        query.$text = { $search: search };
      }

      // Pagination
      const skip = (page - 1) * limit;

      // Execute query
      const [jobs, total] = await Promise.all([
        Job.find(query)
          .populate('client', 'name email companyName')
          .sort(search ? { score: { $meta: 'textScore' } } : sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Job.countDocuments(query),
      ]);

      return {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch jobs: ${error.message}`);
    }
  }

  // Get job by ID
  async getJobById(jobId) {
    try {
      const job = await Job.findOne({
        _id: jobId,
        isActive: true,
        deletedAt: null,
      }).populate('client', 'name email companyName');

      if (!job) {
        throw new Error('Job not found');
      }

      // Increment views
      await job.incrementViews();

      return job;
    } catch (error) {
      throw new Error(`Failed to fetch job: ${error.message}`);
    }
  }

  // Update job
  async updateJob(jobId, userId, updateData) {
    try {
      const job = await Job.findOne({
        _id: jobId,
        client: userId,
        isActive: true,
        deletedAt: null,
      });

      if (!job) {
        throw new Error('Job not found or unauthorized');
      }

      // Prevent certain updates if job has proposals
      if (job.proposalsCount > 0) {
        const restrictedFields = ['budgetAmount', 'budgetType', 'category'];
        const hasRestrictedUpdate = restrictedFields.some(field => updateData[field]);
        
        if (hasRestrictedUpdate) {
          throw new Error('Cannot update budget or category after receiving proposals');
        }
      }

      Object.assign(job, updateData);
      await job.save();
      await job.populate('client', 'name email companyName');

      return job;
    } catch (error) {
      throw new Error(`Failed to update job: ${error.message}`);
    }
  }

  // Delete job (soft delete)
  async deleteJob(jobId, userId) {
    try {
      const job = await Job.findOne({
        _id: jobId,
        client: userId,
        isActive: true,
        deletedAt: null,
      });

      if (!job) {
        throw new Error('Job not found or unauthorized');
      }

      // Soft delete if no proposals, hard delete if in draft
      if (job.status === 'draft') {
        await Job.findByIdAndDelete(jobId);
      } else if (job.proposalsCount === 0) {
        job.deletedAt = new Date();
        job.isActive = false;
        await job.save();
      } else {
        throw new Error('Cannot delete job with active proposals. Close the job instead.');
      }

      return { message: 'Job deleted successfully' };
    } catch (error) {
      throw new Error(`Failed to delete job: ${error.message}`);
    }
  }

  // Get jobs posted by a specific client
  async getClientJobs(clientId, options = {}) {
    try {
      const { page = 1, limit = 10, status } = options;
      
      const query = {
        client: clientId,
        isActive: true,
        deletedAt: null,
      };

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      const [jobs, total] = await Promise.all([
        Job.find(query)
          .sort('-createdAt')
          .skip(skip)
          .limit(limit)
          .lean(),
        Job.countDocuments(query),
      ]);

      return {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch client jobs: ${error.message}`);
    }
  }

  // Close job
  async closeJob(jobId, userId) {
    try {
      const job = await Job.findOne({
        _id: jobId,
        client: userId,
        isActive: true,
        deletedAt: null,
      });

      if (!job) {
        throw new Error('Job not found or unauthorized');
      }

      job.status = 'closed';
      await job.save();

      return job;
    } catch (error) {
      throw new Error(`Failed to close job: ${error.message}`);
    }
  }

  // Get job statistics
  async getJobStats(clientId) {
    try {
      const stats = await Job.aggregate([
        {
          $match: {
            client: clientId,
            isActive: true,
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalBudget: { $sum: '$budgetAmount' },
          },
        },
      ]);

      const totalJobs = await Job.countDocuments({
        client: clientId,
        isActive: true,
        deletedAt: null,
      });

      return {
        total: totalJobs,
        byStatus: stats,
      };
    } catch (error) {
      throw new Error(`Failed to fetch job statistics: ${error.message}`);
    }
  }
}

export default new JobService();
