/**
 * Job Data Transfer Object
 * Formats job data for API responses
 */
class JobDTO {
  constructor(job) {
    this.id = job._id || job.id;
    this.title = job.title;
    this.description = job.description;
    this.budget = job.budget;
    this.duration = job.duration;
    this.skills = job.skills || [];
    this.status = job.status;
    this.category = job.category;
    this.experienceLevel = job.experienceLevel;
    
    // Client information (if populated)
    if (job.client) {
      if (typeof job.client === 'object' && job.client._id) {
        this.client = {
          id: job.client._id,
          name: job.client.name,
          companyName: job.client.companyName,
          avatar: job.client.avatar
        };
      } else {
        this.client = { id: job.client };
      }
    }

    this.proposalsCount = job.proposalsCount || 0;
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
      budget: job.budget,
      duration: job.duration,
      skills: job.skills || [],
      status: job.status,
      createdAt: job.createdAt
    };
  }
}

export default JobDTO;
