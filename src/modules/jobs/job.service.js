import Job from '../../models/Job.js';
import User from '../../models/User.js';

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
      
      // Increment client's job statistics
      await User.findByIdAndUpdate(clientId, {
        $inc: { 
          postedJobsCount: 1,
          activeJobsCount: job.status === 'open' ? 1 : 0
        }
      });
      
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

      const wasOpen = job.status === 'open';
      
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
      
      // Decrement client's job statistics
      const updates = { $inc: { postedJobsCount: -1 } };
      if (wasOpen) {
        updates.$inc.activeJobsCount = -1;
      }
      await User.findByIdAndUpdate(userId, updates);

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

      const previousStatus = job.status;
      job.status = 'closed';
      await job.save();
      
      // Decrement activeJobsCount if job was previously open
      if (previousStatus === 'open') {
        await User.findByIdAndUpdate(userId, {
          $inc: { activeJobsCount: -1 }
        });
      }

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

  // Complete job and update user statistics
  async completeJob(jobId, userId, freelancerId, finalAmount) {
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

      if (job.status !== 'in-progress' && job.status !== 'in-review') {
        throw new Error('Only jobs in progress or in review can be completed');
      }

      const wasOpen = job.status === 'open';
      job.status = 'completed';
      job.assignedFreelancer = freelancerId;
      await job.save();

      // Update client statistics
      const clientUpdates = { 
        $inc: { totalSpent: finalAmount || job.budgetAmount }
      };
      if (wasOpen) {
        clientUpdates.$inc.activeJobsCount = -1;
      }
      await User.findByIdAndUpdate(userId, clientUpdates);

      // Update freelancer statistics
      await User.findByIdAndUpdate(freelancerId, {
        $inc: { 
          completedJobsCount: 1,
          totalEarnings: finalAmount || job.budgetAmount,
          activeProposalsCount: -1
        }
      });

      return job;
    } catch (error) {
      throw new Error(`Failed to complete job: ${error.message}`);
    }
  }
}

export default new JobService();
