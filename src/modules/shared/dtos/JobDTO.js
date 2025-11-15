export const formatJob = (job) => {
  if (!job) return null;

  const formattedJob = {
    id: job._id || job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    skills: job.skills || [],
    budgetType: job.budgetType,
  };

  if (job.budgetType === 'fixed') {
    formattedJob.budgetAmount = job.budgetAmount;
    formattedJob.budgetDisplay = `$${job.budgetAmount?.toLocaleString()} Fixed`;
  } else if (job.budgetType === 'hourly' && job.hourlyRate) {
    formattedJob.hourlyRate = {
      min: job.hourlyRate.min,
      max: job.hourlyRate.max,
    };
    formattedJob.budgetDisplay = `$${job.hourlyRate.min}-$${job.hourlyRate.max}/hr`;
  }

  formattedJob.duration = job.duration;
  formattedJob.experienceLevel = job.experienceLevel;
  formattedJob.projectSize = job.projectSize;

  if (job.location) {
    formattedJob.location = {
      type: job.location.type,
      country: job.location.country,
      city: job.location.city,
      timezone: job.location.timezone,
    };
  }

  if (job.client) {
    if (typeof job.client === 'object' && job.client._id) {
      formattedJob.client = {
        id: job.client._id,
        name: job.client.name,
        email: job.client.email,
        companyName: job.client.companyName,
        avatar: job.client.avatar
      };
    } else {
      formattedJob.client = { id: job.client };
    }
  }

  formattedJob.status = job.status;
  formattedJob.proposalsCount = job.proposalsCount || 0;
  formattedJob.maxProposals = job.maxProposals;

  formattedJob.attachments = job.attachments?.map(att => ({
    name: att.name,
    url: att.url,
    size: att.size,
    uploadedAt: att.uploadedAt,
  })) || [];

  formattedJob.applicationDeadline = job.applicationDeadline;
  formattedJob.startDate = job.startDate;
  formattedJob.isPublic = job.isPublic;
  formattedJob.isFeatured = job.isFeatured;
  formattedJob.views = job.views || 0;
  formattedJob.isExpired = job.isExpired;
  formattedJob.canAcceptProposals = job.canAcceptProposals ? job.canAcceptProposals() : false;
  formattedJob.createdAt = job.createdAt;
  formattedJob.updatedAt = job.updatedAt;

  return formattedJob;
};

export const formatJobMinimal = (job) => {
  if (!job) return null;

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
};

export default formatJob;
