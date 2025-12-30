/**
 * Data Sanitizer for AI Requests
 * Ensures no sensitive data (CNIC, email, phone, payment info) is sent to AI
 */

/**
 * Sensitive fields to remove from user data
 */
const SENSITIVE_USER_FIELDS = [
  'password',
  'email',
  'phone',
  'googleId',
  'resetPasswordOTP',
  'resetPasswordOTPExpires',
  'cnic', // Entire CNIC object
  'isBanned',
  'isActive',
  'suspendedAt',
  'bannedAt',
  'suspendedBy',
  'bannedBy',
  'suspensionReason',
  'banReason',
];

/**
 * Sensitive fields to remove from job data
 */
const SENSITIVE_JOB_FIELDS = [
  'client', // Will be replaced with sanitized version
  'assignedFreelancer', // Will be replaced with sanitized version
  'deletedAt',
  'isFlagged',
  'flagReason',
  'flaggedBy',
  'flaggedAt',
];

/**
 * Whitelist of safe fields for user profile
 */
const SAFE_USER_FIELDS = [
  'name',
  'role',
  'bio',
  'location',
  'website',
  'languages',
  'availability',
  'skills',
  'hourlyRate',
  'experience',
  'portfolio',
  'appliedJobsCount',
  'completedJobsCount',
  'totalEarnings',
  'companyName',
  'companySize',
  'industry',
  'postedJobsCount',
  'activeJobsCount',
  'totalSpent',
];

/**
 * Whitelist of safe fields for job
 */
const SAFE_JOB_FIELDS = [
  'title',
  'description',
  'category',
  'skills',
  'budgetType',
  'budgetAmount',
  'hourlyRate',
  'estimatedHours',
  'duration',
  'experienceLevel',
  'projectSize',
  'locationType',
  'location',
  'requirements',
  'preferredQualifications',
  'createdAt',
];

/**
 * Sanitize user data for AI requests
 * @param {Object} user - User object from database
 * @returns {Object} Sanitized user object
 */
export const sanitizeUser = (user) => {
  if (!user || typeof user !== 'object') {
    return null;
  }

  // Convert to plain object if Mongoose document
  const userObj = user.toObject ? user.toObject() : { ...user };

  // Create sanitized user with only safe fields
  const sanitized = {};
  
  SAFE_USER_FIELDS.forEach(field => {
    if (userObj[field] !== undefined && userObj[field] !== null) {
      sanitized[field] = userObj[field];
    }
  });

  // Sanitize portfolio items (remove any URLs that might contain sensitive data)
  if (sanitized.portfolio && Array.isArray(sanitized.portfolio)) {
    sanitized.portfolio = sanitized.portfolio.map(item => ({
      title: item.title || '',
      description: item.description || '',
      // Don't include URL or image to avoid potential data leakage
    }));
  }

  return sanitized;
};

/**
 * Sanitize job data for AI requests
 * @param {Object} job - Job object from database
 * @returns {Object} Sanitized job object
 */
export const sanitizeJob = (job) => {
  if (!job || typeof job !== 'object') {
    return null;
  }

  // Convert to plain object if Mongoose document
  const jobObj = job.toObject ? job.toObject() : { ...job };

  // Create sanitized job with only safe fields
  const sanitized = {};
  
  SAFE_JOB_FIELDS.forEach(field => {
    if (jobObj[field] !== undefined && jobObj[field] !== null) {
      sanitized[field] = jobObj[field];
    }
  });

  // Sanitize client if populated (only include safe fields)
  if (jobObj.client && typeof jobObj.client === 'object') {
    sanitized.client = {
      name: jobObj.client.name || 'Client',
      companyName: jobObj.client.companyName || '',
    };
  }

  return sanitized;
};

/**
 * Sanitize proposal data for AI requests
 * @param {Object} proposal - Proposal object from database
 * @returns {Object} Sanitized proposal object
 */
export const sanitizeProposal = (proposal) => {
  if (!proposal || typeof proposal !== 'object') {
    return null;
  }

  const proposalObj = proposal.toObject ? proposal.toObject() : { ...proposal };

  return {
    coverLetter: proposalObj.coverLetter || '',
    bidAmount: proposalObj.bidAmount || 0,
    deliveryTime: proposalObj.deliveryTime || 0,
    status: proposalObj.status || 'pending',
    // Don't include freelancerId or jobId - they'll be passed separately as sanitized objects
  };
};

/**
 * Remove sensitive data from any object recursively
 * @param {Object} obj - Object to sanitize
 * @param {Array} sensitiveFields - List of sensitive field names
 * @returns {Object} Sanitized object
 */
export const removeSensitiveFields = (obj, sensitiveFields = []) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => removeSensitiveFields(item, sensitiveFields));
  }

  const sanitized = {};
  const allSensitiveFields = [
    ...SENSITIVE_USER_FIELDS,
    ...SENSITIVE_JOB_FIELDS,
    ...sensitiveFields,
  ];

  Object.keys(obj).forEach(key => {
    if (!allSensitiveFields.includes(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !(obj[key] instanceof Date)) {
        sanitized[key] = removeSensitiveFields(obj[key], sensitiveFields);
      } else {
        sanitized[key] = obj[key];
      }
    }
  });

  return sanitized;
};

/**
 * Validate that no sensitive data is present
 * @param {Object} data - Data to validate
 * @returns {boolean} True if data is safe
 */
export const validateSanitizedData = (data) => {
  const sensitivePatterns = [
    /\d{5}-\d{7}-\d{1}/, // CNIC pattern
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email pattern
    /\+92\d{10}/, // Pakistani phone pattern
    /03\d{9}/, // Pakistani mobile pattern
  ];

  const dataString = JSON.stringify(data);
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(dataString)) {
      console.warn('⚠️  Potential sensitive data detected in sanitized data');
      return false;
    }
  }

  return true;
};

export default {
  sanitizeUser,
  sanitizeJob,
  sanitizeProposal,
  removeSensitiveFields,
  validateSanitizedData,
};




