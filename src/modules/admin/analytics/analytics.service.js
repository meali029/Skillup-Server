import User from '../../../models/User.js';
import Job from '../../../models/Job.js';
import Proposal from '../../../models/Proposal.js';
import mongoose from 'mongoose';

class AnalyticsService {
  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics() {
    const [
      totalRevenue,
      platformFees,
      activeUsers,
      jobStats,
      topFreelancers,
      topClients,
      verificationStats,
      flaggedJobsCount
    ] = await Promise.all([
      this.getTotalRevenue(),
      this.getPlatformFees(),
      this.getActiveUsers(),
      this.getJobStats(),
      this.getTopFreelancers(5),
      this.getTopClients(5),
      this.getVerificationStats(),
      this.getFlaggedJobsCount()
    ]);

    return {
      totalRevenue,
      platformFees,
      activeUsers,
      jobStats,
      topFreelancers,
      topClients,
      verificationStats,
      flaggedJobsCount
    };
  }

  /**
   * Get total revenue
   */
  async getTotalRevenue() {
    const result = await Job.aggregate([
      {
        $match: {
          status: 'completed',
          'payment.status': 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$budgetAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    return result[0] || { total: 0, count: 0 };
  }

  /**
   * Get platform fees collected
   */
  async getPlatformFees() {
    const result = await Job.aggregate([
      {
        $match: {
          status: 'completed',
          'payment.status': 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$budgetAmount', 0.10] } }, // 10% platform fee
          count: { $sum: 1 }
        }
      }
    ]);

    return result[0] || { total: 0, count: 0 };
  }

  /**
   * Get active users
   */
  async getActiveUsers() {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [daily, weekly, monthly, total] = await Promise.all([
      User.countDocuments({ lastLogin: { $gte: oneDayAgo } }),
      User.countDocuments({ lastLogin: { $gte: oneWeekAgo } }),
      User.countDocuments({ lastLogin: { $gte: oneMonthAgo } }),
      User.countDocuments({ isActive: true })
    ]);

    return { daily, weekly, monthly, total };
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    const [posted, completed, inProgress, cancelled, avgValue] = await Promise.all([
      Job.countDocuments({ status: { $ne: 'draft' } }),
      Job.countDocuments({ status: 'completed' }),
      Job.countDocuments({ status: 'in-progress' }),
      Job.countDocuments({ status: { $in: ['cancelled', 'closed'] } }),
      this.getAverageJobValue()
    ]);

    return {
      posted,
      completed,
      inProgress,
      cancelled,
      completionRate: posted > 0 ? ((completed / posted) * 100).toFixed(2) : 0,
      avgValue
    };
  }

  /**
   * Get average job value
   */
  async getAverageJobValue() {
    const result = await Job.aggregate([
      {
        $match: {
          budgetType: 'fixed',
          status: { $ne: 'draft' }
        }
      },
      {
        $group: {
          _id: null,
          avg: { $avg: '$budgetAmount' }
        }
      }
    ]);

    return result[0]?.avg || 0;
  }

  /**
   * Get top freelancers
   */
  async getTopFreelancers(limit = 10) {
    const freelancers = await User.aggregate([
      {
        $match: { role: 'freelancer', isActive: true }
      },
      {
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'assignedFreelancer',
          as: 'completedJobs'
        }
      },
      {
        $addFields: {
          completedCount: {
            $size: {
              $filter: {
                input: '$completedJobs',
                as: 'job',
                cond: { $eq: ['$$job.status', 'completed'] }
              }
            }
          },
          totalEarnings: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$completedJobs',
                    as: 'job',
                    cond: { $eq: ['$$job.status', 'completed'] }
                  }
                },
                as: 'job',
                in: '$$job.budgetAmount'
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          completedJobs: '$completedCount',
          totalEarnings: 1,
          rating: '$profile.rating',
          skills: '$profile.skills'
        }
      },
      {
        $sort: { completedJobs: -1, totalEarnings: -1 }
      },
      {
        $limit: limit
      }
    ]);

    return freelancers;
  }

  /**
   * Get top clients
   */
  async getTopClients(limit = 10) {
    const clients = await User.aggregate([
      {
        $match: { role: 'client', isActive: true }
      },
      {
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'client',
          as: 'postedJobs'
        }
      },
      {
        $addFields: {
          jobsPosted: { $size: '$postedJobs' },
          completedJobs: {
            $size: {
              $filter: {
                input: '$postedJobs',
                as: 'job',
                cond: { $eq: ['$$job.status', 'completed'] }
              }
            }
          },
          totalSpent: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$postedJobs',
                    as: 'job',
                    cond: { $eq: ['$$job.status', 'completed'] }
                  }
                },
                as: 'job',
                in: '$$job.budgetAmount'
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          company: '$profile.company',
          jobsPosted: 1,
          completedJobs: 1,
          totalSpent: 1
        }
      },
      {
        $sort: { jobsPosted: -1, totalSpent: -1 }
      },
      {
        $limit: limit
      }
    ]);

    return clients;
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats() {
    const [verified, pending, rejected, total] = await Promise.all([
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ 'verification.status': 'pending' }),
      User.countDocuments({ 'verification.status': 'rejected' }),
      User.countDocuments()
    ]);

    return {
      verified,
      pending,
      rejected,
      unverified: total - verified,
      total
    };
  }

  /**
   * Get flagged jobs count
   */
  async getFlaggedJobsCount() {
    const [manual, auto, high, total] = await Promise.all([
      Job.countDocuments({ isFlagged: true }),
      Job.countDocuments({ 'autoModeration.flagged': true }),
      Job.countDocuments({ 'autoModeration.highestSeverity': 'high' }),
      Job.countDocuments()
    ]);

    return { manual, auto, high, total };
  }

  /**
   * Get user growth report
   */
  async getUserGrowthReport(startDate, endDate, interval = 'day') {
    const groupFormat = interval === 'month' 
      ? { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }
      : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };

    const data = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      },
      {
        $group: {
          _id: groupFormat,
          freelancers: {
            $sum: { $cond: [{ $eq: ['$role', 'freelancer'] }, 1, 0] }
          },
          clients: {
            $sum: { $cond: [{ $eq: ['$role', 'client'] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    return data;
  }

  /**
   * Get revenue report
   */
  async getRevenueReport(startDate, endDate) {
    const data = await Job.aggregate([
      {
        $match: {
          status: 'completed',
          'payment.paidAt': { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$payment.paidAt' },
            month: { $month: '$payment.paidAt' }
          },
          revenue: { $sum: '$budgetAmount' },
          platformFee: { $sum: { $multiply: ['$budgetAmount', 0.10] } },
          jobCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    return data;
  }

  /**
   * Get job category distribution
   */
  async getJobCategoryDistribution() {
    const data = await Job.aggregate([
      {
        $match: { status: { $ne: 'draft' } }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: '$budgetAmount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    return data;
  }

  /**
   * Get flagged jobs report
   */
  async getFlaggedJobsReport(startDate, endDate) {
    const jobs = await Job.find({
      $or: [
        { isFlagged: true },
        { 'autoModeration.flagged': true }
      ],
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    })
      .populate('client', 'name email')
      .select('title category status isFlagged autoModeration createdAt')
      .lean();

    return jobs;
  }

  /**
   * Get detailed analytics for export
   */
  async getDetailedAnalytics(startDate, endDate) {
    const [
      metrics,
      userGrowth,
      revenue,
      categories,
      flaggedJobs
    ] = await Promise.all([
      this.getDashboardMetrics(),
      this.getUserGrowthReport(startDate, endDate),
      this.getRevenueReport(startDate, endDate),
      this.getJobCategoryDistribution(),
      this.getFlaggedJobsReport(startDate, endDate)
    ]);

    return {
      metrics,
      userGrowth,
      revenue,
      categories,
      flaggedJobs,
      generatedAt: new Date(),
      period: { start: startDate, end: endDate }
    };
  }
}

export default new AnalyticsService();
