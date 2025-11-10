/**
 * Job Data Transfer Object
 * Formats job data for API responses
 */
class JobDTO {
  constructor(job) {
    this.id = job._id || job.id;
    this.title = job.title;
    this.description = job.description;
    this.category = job.category;
    this.skills = job.skills || [];
    
    // Budget information
    this.budgetType = job.budgetType;
    if (job.budgetType === 'fixed') {
      this.budgetAmount = job.budgetAmount;
      this.budgetDisplay = `$${job.budgetAmount?.toLocaleString()} Fixed`;
    } else if (job.budgetType === 'hourly' && job.hourlyRate) {
      this.hourlyRate = {
        min: job.hourlyRate.min,
        max: job.hourlyRate.max,
      };
      this.budgetDisplay = `$${job.hourlyRate.min}-$${job.hourlyRate.max}/hr`;
    }
    
    this.duration = job.duration;
    this.experienceLevel = job.experienceLevel;
    this.projectSize = job.projectSize;
    
    // Location
    if (job.location) {
      this.location = {
        type: job.location.type,
        country: job.location.country,
        city: job.location.city,
        timezone: job.location.timezone,
      };
    }
    
    // Client information (if populated)
    if (job.client) {
      if (typeof job.client === 'object' && job.client._id) {
        this.client = {
          id: job.client._id,
          name: job.client.name,
          email: job.client.email,
          companyName: job.client.companyName,
          avatar: job.client.avatar
        };
      } else {
        this.client = { id: job.client };
      }
    }

    // Status and proposals
    this.status = job.status;
    this.proposalsCount = job.proposalsCount || 0;
    this.maxProposals = job.maxProposals;
    
    // Attachments
    this.attachments = job.attachments?.map(att => ({
      name: att.name,
      url: att.url,
      size: att.size,
      uploadedAt: att.uploadedAt,
    })) || [];
    
    // Dates
    this.applicationDeadline = job.applicationDeadline;
    this.startDate = job.startDate;
    
    // Visibility
    this.isPublic = job.isPublic;
    this.isFeatured = job.isFeatured;
    
    // Statistics
    this.views = job.views || 0;
    
    // Virtuals
    this.isExpired = job.isExpired;
    this.canAcceptProposals = job.canAcceptProposals ? job.canAcceptProposals() : false;
    
    // Timestamps
    this.createdAt = job.createdAt;
    this.updatedAt = job.updatedAt;
  }

  /**
   * Create a minimal job response (for lists)
   */
  static minimal(job) {
    return {
      id: job._id || job.id,
      title: job.title,
      budgetType: job.budgetType,
      budgetAmount: job.budgetAmount,
      hourlyRate: job.hourlyRate,
      duration: job.duration,
      skills: job.skills || [],
      status: job.status,
      category: job.category,
      proposalsCount: job.proposalsCount || 0,
      views: job.views || 0,
      createdAt: job.createdAt
    };
  }
}

export default JobDTO;
