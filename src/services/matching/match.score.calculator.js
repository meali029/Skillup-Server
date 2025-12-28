/**
 * Match Score Calculator
 * Calculates match scores using rule-based logic
 * Can be enhanced with AI (via AI service)
 */

/**
 * Calculate base match score (rule-based)
 * @param {Object} job - Job object
 * @param {Object} freelancer - Freelancer object
 * @returns {number} Match score (0-100)
 */
export const calculateBaseMatchScore = (job, freelancer) => {
  if (!job || !freelancer) {
    return 0;
  }

  let score = 0;

  // 1. Skill Match (40% weight)
  const skillScore = calculateSkillMatch(job.skills || [], freelancer.skills || []);
  score += skillScore * 0.4;

  // 2. Experience Match (20% weight)
  const experienceScore = calculateExperienceMatch(
    job.experienceLevel,
    freelancer.experience
  );
  score += experienceScore * 0.2;

  // 3. Budget Alignment (15% weight)
  const budgetScore = calculateBudgetMatch(job, freelancer);
  score += budgetScore * 0.15;

  // 4. Portfolio Quality (15% weight)
  const portfolioScore = calculatePortfolioScore(freelancer.portfolio || []);
  score += portfolioScore * 0.15;

  // 5. Recency Bonus (10% weight)
  const recencyScore = calculateRecencyScore(job.createdAt);
  score += recencyScore * 0.1;

  return Math.min(100, Math.round(score));
};

/**
 * Calculate skill match score
 * @param {Array} jobSkills - Required skills
 * @param {Array} freelancerSkills - Freelancer skills
 * @returns {number} Score (0-100)
 */
const calculateSkillMatch = (jobSkills, freelancerSkills) => {
  if (!jobSkills.length || !freelancerSkills.length) {
    return 0;
  }

  const jobSkillsLower = jobSkills.map(s => s.toLowerCase().trim());
  const freelancerSkillsLower = freelancerSkills.map(s => s.toLowerCase().trim());

  // Count exact matches
  const matchedSkills = jobSkillsLower.filter(skill =>
    freelancerSkillsLower.includes(skill)
  );

  // Calculate percentage
  const matchPercentage = (matchedSkills.length / jobSkills.length) * 100;

  // Bonus for extra matching skills
  const extraSkills = freelancerSkillsLower.filter(skill =>
    jobSkillsLower.includes(skill)
  ).length - matchedSkills.length;
  const bonus = Math.min(extraSkills * 2, 10);

  return Math.min(100, matchPercentage + bonus);
};

/**
 * Calculate experience match score
 * @param {string} jobExperience - Required experience level
 * @param {string} freelancerExperience - Freelancer experience level
 * @returns {number} Score (0-100)
 */
const calculateExperienceMatch = (jobExperience, freelancerExperience) => {
  if (!jobExperience || !freelancerExperience) {
    return 50; // Neutral score if missing
  }

  const levels = {
    beginner: 1,
    entry: 1,
    intermediate: 2,
    expert: 3,
  };

  const jobLevel = levels[jobExperience.toLowerCase()] || 2;
  const freelancerLevel = levels[freelancerExperience.toLowerCase()] || 2;

  // Perfect match
  if (jobLevel === freelancerLevel) {
    return 100;
  }

  // One level difference
  if (Math.abs(jobLevel - freelancerLevel) === 1) {
    return 75;
  }

  // Two levels difference
  if (Math.abs(jobLevel - freelancerLevel) === 2) {
    return 50;
  }

  return 25;
};

/**
 * Calculate budget match score
 * @param {Object} job - Job object
 * @param {Object} freelancer - Freelancer object
 * @returns {number} Score (0-100)
 */
const calculateBudgetMatch = (job, freelancer) => {
  if (!freelancer.hourlyRate) {
    return 50; // Neutral if freelancer hasn't set rate
  }

  if (job.budgetType === 'fixed') {
    // For fixed budget, check if freelancer's rate aligns
    // This is a simplified check - could be enhanced
    return 70; // Default score for fixed budget
  }

  if (job.budgetType === 'hourly' && job.hourlyRate) {
    const minRate = job.hourlyRate.min || 0;
    const maxRate = job.hourlyRate.max || Infinity;
    const freelancerRate = freelancer.hourlyRate;

    // Perfect match within range
    if (freelancerRate >= minRate && freelancerRate <= maxRate) {
      return 100;
    }

    // Close to range (within 20%)
    const range = maxRate - minRate;
    const tolerance = range * 0.2;
    if (freelancerRate >= minRate - tolerance && freelancerRate <= maxRate + tolerance) {
      return 80;
    }

    // Too high or too low
    return 40;
  }

  return 50;
};

/**
 * Calculate portfolio quality score
 * @param {Array} portfolio - Portfolio items
 * @returns {number} Score (0-100)
 */
const calculatePortfolioScore = (portfolio) => {
  if (!portfolio || !portfolio.length) {
    return 30; // Low score if no portfolio
  }

  // Base score for having portfolio
  let score = 50;

  // Bonus for multiple items
  if (portfolio.length >= 3) {
    score += 20;
  } else if (portfolio.length >= 1) {
    score += 10;
  }

  // Bonus for items with descriptions
  const itemsWithDescription = portfolio.filter(item => item.description && item.description.length > 50);
  if (itemsWithDescription.length > 0) {
    score += 20;
  }

  // Bonus for items with titles
  const itemsWithTitle = portfolio.filter(item => item.title && item.title.length > 0);
  if (itemsWithTitle.length > 0) {
    score += 10;
  }

  return Math.min(100, score);
};

/**
 * Calculate recency score (bonus for recent jobs)
 * @param {Date} createdAt - Job creation date
 * @returns {number} Score (0-100)
 */
const calculateRecencyScore = (createdAt) => {
  if (!createdAt) {
    return 50;
  }

  const now = new Date();
  const jobDate = new Date(createdAt);
  const daysSincePosted = Math.floor((now - jobDate) / (1000 * 60 * 60 * 24));

  // Recent jobs (within 7 days) get bonus
  if (daysSincePosted <= 7) {
    return 100;
  }

  // Jobs within 30 days
  if (daysSincePosted <= 30) {
    return 75;
  }

  // Jobs within 90 days
  if (daysSincePosted <= 90) {
    return 50;
  }

  // Older jobs
  return 25;
};

export default {
  calculateBaseMatchScore,
  calculateSkillMatch,
  calculateExperienceMatch,
  calculateBudgetMatch,
  calculatePortfolioScore,
  calculateRecencyScore,
};




