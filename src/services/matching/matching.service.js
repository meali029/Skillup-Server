/**
 * Matching Service
 * Orchestrates matching between jobs and freelancers
 * Combines rule-based and AI-enhanced matching
 */

import { calculateBaseMatchScore } from './match.score.calculator.js';
import aiService from '../ai/ai.service.js';
import adminSettingsService from '../../modules/admin/admin.settings.service.js';

/**
 * Calculate match score for job-freelancer pair
 * @param {Object} job - Job object
 * @param {Object} freelancer - Freelancer object
 * @param {boolean} useAI - Whether to use AI enhancement (default: true, respects feature flag)
 * @returns {Promise<Object>} Match score with details
 */
export const calculateMatchScore = async (job, freelancer, useAI = true) => {
  // Calculate base score (rule-based)
  const baseScore = calculateBaseMatchScore(job, freelancer);

  // Check if AI enhancement is enabled
  let enhancedScore = null;
  if (useAI) {
    try {
      const aiEnabled = await adminSettingsService.isFeatureEnabled('matchScoreEnhancement');
      if (aiEnabled) {
        enhancedScore = await aiService.enhanceJobMatchScore(job, freelancer, baseScore);
      }
    } catch (error) {
      console.error('[Matching Service] AI enhancement failed:', error);
      // Continue with base score only
    }
  }

  // Use enhanced score if available, otherwise use base score
  const finalScore = enhancedScore ? enhancedScore.finalScore : baseScore;

  return {
    baseScore,
    aiScore: enhancedScore ? enhancedScore.aiScore : null,
    finalScore,
    confidence: enhancedScore ? enhancedScore.confidence : 0,
    reasoning: enhancedScore ? enhancedScore.reasoning : 'Rule-based matching',
    factors: enhancedScore ? enhancedScore.factors : {
      skillMatch: baseScore * 0.4,
      experienceMatch: baseScore * 0.2,
      budgetMatch: baseScore * 0.15,
      portfolio: baseScore * 0.15,
      recency: baseScore * 0.1,
    },
    aiEnhanced: !!enhancedScore,
  };
};

/**
 * Rank jobs by match score for a freelancer
 * @param {Array} jobs - Array of job objects
 * @param {Object} freelancer - Freelancer object
 * @param {boolean} useAI - Whether to use AI enhancement
 * @returns {Promise<Array>} Sorted jobs with match scores
 */
export const rankJobs = async (jobs, freelancer, useAI = true) => {
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return [];
  }

  if (!freelancer) {
    return jobs.map(job => ({
      ...job,
      matchScore: 0,
      baseScore: 0,
      finalScore: 0,
    }));
  }

  // Calculate match scores for all jobs
  const jobsWithScores = await Promise.all(
    jobs.map(async (job) => {
      const matchResult = await calculateMatchScore(job, freelancer, useAI);
      return {
        ...job.toObject ? job.toObject() : { ...job },
        matchScore: matchResult.finalScore,
        baseScore: matchResult.baseScore,
        aiScore: matchResult.aiScore,
        matchConfidence: matchResult.confidence,
        matchReasoning: matchResult.reasoning,
        aiEnhanced: matchResult.aiEnhanced,
      };
    })
  );

  // Sort by final score (descending)
  return jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);
};

/**
 * Rank freelancers by match score for a job
 * @param {Array} freelancers - Array of freelancer objects
 * @param {Object} job - Job object
 * @param {boolean} useAI - Whether to use AI enhancement
 * @returns {Promise<Array>} Sorted freelancers with match scores
 */
export const rankFreelancers = async (freelancers, job, useAI = true) => {
  if (!freelancers || !Array.isArray(freelancers) || freelancers.length === 0) {
    return [];
  }

  if (!job) {
    return freelancers.map(freelancer => ({
      ...freelancer,
      matchScore: 0,
      baseScore: 0,
      finalScore: 0,
    }));
  }

  // Calculate match scores for all freelancers
  const freelancersWithScores = await Promise.all(
    freelancers.map(async (freelancer) => {
      const matchResult = await calculateMatchScore(job, freelancer, useAI);
      return {
        ...freelancer.toObject ? freelancer.toObject() : { ...freelancer },
        matchScore: matchResult.finalScore,
        baseScore: matchResult.baseScore,
        aiScore: matchResult.aiScore,
        matchConfidence: matchResult.confidence,
        matchReasoning: matchResult.reasoning,
        aiEnhanced: matchResult.aiEnhanced,
      };
    })
  );

  // Sort by final score (descending)
  return freelancersWithScores.sort((a, b) => b.matchScore - a.matchScore);
};

/**
 * Filter jobs by minimum match score
 * @param {Array} jobs - Array of jobs with match scores
 * @param {number} minScore - Minimum match score (0-100)
 * @returns {Array} Filtered jobs
 */
export const filterJobsByMatchScore = (jobs, minScore = 30) => {
  if (!jobs || !Array.isArray(jobs)) {
    return [];
  }

  return jobs.filter(job => {
    const score = job.matchScore || job.finalScore || 0;
    return score >= minScore;
  });
};

/**
 * Filter freelancers by minimum match score
 * @param {Array} freelancers - Array of freelancers with match scores
 * @param {number} minScore - Minimum match score (0-100)
 * @returns {Array} Filtered freelancers
 */
export const filterFreelancersByMatchScore = (freelancers, minScore = 30) => {
  if (!freelancers || !Array.isArray(freelancers)) {
    return [];
  }

  return freelancers.filter(freelancer => {
    const score = freelancer.matchScore || freelancer.finalScore || 0;
    return score >= minScore;
  });
};

export default {
  calculateMatchScore,
  rankJobs,
  rankFreelancers,
  filterJobsByMatchScore,
  filterFreelancersByMatchScore,
};




