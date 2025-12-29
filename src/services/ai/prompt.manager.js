/**
 * Prompt Manager
 * Centralized prompt management with template substitution
 */

import jobRecommendationPrompt from './prompts/job-recommendation.prompt.js';
import freelancerRecommendationPrompt from './prompts/freelancer-recommendation.prompt.js';
import proposalPrompts from './prompts/proposal-generation.prompt.js';
import matchEnhancementPrompt from './prompts/match-enhancement.prompt.js';
import proposalRankingPrompt from './prompts/proposal-ranking.prompt.js';

/**
 * Prompt Manager Class
 * Handles prompt template loading, variable substitution, and versioning
 */
class PromptManager {
  constructor() {
    this.prompts = {
      jobRecommendation: jobRecommendationPrompt,
      freelancerRecommendation: freelancerRecommendationPrompt,
      proposalGeneration: proposalPrompts,
      matchEnhancement: matchEnhancementPrompt,
      proposalRanking: proposalRankingPrompt,
    };
  }

  /**
   * Get prompt template by name
   * @param {string} promptName - Name of the prompt
   * @param {string} subPrompt - Sub-prompt name (e.g., 'coverLetter' for proposalGeneration)
   * @returns {Object} Prompt template object
   */
  getPrompt(promptName, subPrompt = null) {
    if (subPrompt) {
      if (this.prompts[promptName] && this.prompts[promptName][subPrompt]) {
        return this.prompts[promptName][subPrompt];
      }
      throw new Error(`Prompt not found: ${promptName}.${subPrompt}`);
    }

    if (!this.prompts[promptName]) {
      throw new Error(`Prompt not found: ${promptName}`);
    }

    return this.prompts[promptName];
  }

  /**
   * Substitute variables in prompt template
   * @param {Object} template - Prompt template object
   * @param {Object} variables - Variables to substitute
   * @returns {string} Rendered prompt string
   */
  renderPrompt(template, variables = {}) {
    if (!template || !template.template) {
      throw new Error('Invalid prompt template');
    }

    let rendered = template.template;

    // Replace all variables
    template.variables.forEach(varName => {
      const value = variables[varName] !== undefined ? variables[varName] : '';
      const placeholder = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      
      // Format value appropriately
      let formattedValue = this.formatValue(value, varName);
      rendered = rendered.replace(placeholder, formattedValue);
    });

    return rendered;
  }

  /**
   * Format value for prompt substitution
   * @param {any} value - Value to format
   * @param {string} varName - Variable name (for context)
   * @returns {string} Formatted value
   */
  formatValue(value, varName) {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'None';
      }
      
      // Format portfolio items specially
      if (varName.includes('portfolio') || varName.includes('Portfolio')) {
        return value.map(item => {
          if (typeof item === 'object') {
            return `${item.title || 'Project'}: ${item.description || ''}`;
          }
          return item;
        }).join('; ');
      }
      
      return value.join(', ');
    }

    // Handle objects
    if (typeof value === 'object') {
      return JSON.stringify(value).substring(0, 200);
    }

    // Handle numbers (budget, rates)
    if (typeof value === 'number') {
      if (varName.includes('budget') || varName.includes('Budget') || 
          varName.includes('rate') || varName.includes('Rate') ||
          varName.includes('amount') || varName.includes('Amount')) {
        return `PKR ${value.toLocaleString()}`;
      }
      return value.toString();
    }

    // Handle strings - truncate if too long
    if (typeof value === 'string') {
      // Truncate descriptions and bios
      if (varName.includes('description') || varName.includes('Description') ||
          varName.includes('bio') || varName.includes('Bio')) {
        return value.substring(0, 500);
      }
      return value;
    }

    return String(value);
  }

  /**
   * Generate job recommendation prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @returns {string} Rendered prompt
   */
  generateJobRecommendationPrompt(job, freelancer) {
    const template = this.getPrompt('jobRecommendation');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      jobSkills: job.skills || [],
      jobExperienceLevel: job.experienceLevel || '',
      jobBudget: this.formatBudget(job),
      jobCategory: job.category || '',
      jobDuration: job.duration || '',
      freelancerSkills: freelancer.skills || [],
      freelancerExperience: freelancer.experience || '',
      freelancerRate: freelancer.hourlyRate || 0,
      freelancerBio: freelancer.bio || '',
      freelancerPortfolio: freelancer.portfolio || [],
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate freelancer recommendation prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @returns {string} Rendered prompt
   */
  generateFreelancerRecommendationPrompt(job, freelancer) {
    const template = this.getPrompt('freelancerRecommendation');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      jobSkills: job.skills || [],
      jobExperienceLevel: job.experienceLevel || '',
      jobBudget: this.formatBudget(job),
      jobCategory: job.category || '',
      jobDuration: job.duration || '',
      freelancerName: freelancer.name || 'Freelancer',
      freelancerSkills: freelancer.skills || [],
      freelancerExperience: freelancer.experience || '',
      freelancerRate: freelancer.hourlyRate || 0,
      freelancerBio: freelancer.bio || '',
      freelancerPortfolio: freelancer.portfolio || [],
      freelancerCompletedJobs: freelancer.completedJobsCount || 0,
      freelancerEarnings: freelancer.totalEarnings || 0,
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate proposal cover letter prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @returns {string} Rendered prompt
   */
  generateCoverLetterPrompt(job, freelancer) {
    const template = this.getPrompt('proposalGeneration', 'coverLetter');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      jobSkills: job.skills || [],
      jobExperienceLevel: job.experienceLevel || '',
      jobBudget: this.formatBudget(job),
      freelancerSkills: freelancer.skills || [],
      freelancerExperience: freelancer.experience || '',
      freelancerBio: freelancer.bio || '',
      freelancerPortfolio: freelancer.portfolio || [],
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate bid amount suggestion prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @returns {string} Rendered prompt
   */
  generateBidAmountPrompt(job, freelancer) {
    const template = this.getPrompt('proposalGeneration', 'bidAmount');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      budgetType: job.budgetType || 'fixed',
      budgetRange: this.formatBudget(job),
      jobDuration: job.duration || '',
      jobExperienceLevel: job.experienceLevel || '',
      freelancerRate: freelancer.hourlyRate || 0,
      freelancerExperience: freelancer.experience || '',
      completedJobs: freelancer.completedJobsCount || 0,
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate delivery time suggestion prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @returns {string} Rendered prompt
   */
  generateDeliveryTimePrompt(job, freelancer) {
    const template = this.getPrompt('proposalGeneration', 'deliveryTime');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      jobDuration: job.duration || '',
      jobExperienceLevel: job.experienceLevel || '',
      projectSize: job.projectSize || 'medium',
      freelancerExperience: freelancer.experience || '',
      freelancerAvailability: freelancer.availability || 'available',
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate match enhancement prompt
   * @param {Object} job - Sanitized job object
   * @param {Object} freelancer - Sanitized freelancer object
   * @param {number} baseScore - Base match score from rule-based matching
   * @returns {string} Rendered prompt
   */
  generateMatchEnhancementPrompt(job, freelancer, baseScore) {
    const template = this.getPrompt('matchEnhancement');
    const variables = {
      jobTitle: job.title || '',
      jobDescription: job.description || '',
      jobSkills: job.skills || [],
      jobExperienceLevel: job.experienceLevel || '',
      jobBudget: this.formatBudget(job),
      jobCategory: job.category || '',
      freelancerSkills: freelancer.skills || [],
      freelancerExperience: freelancer.experience || '',
      freelancerRate: freelancer.hourlyRate || 0,
      freelancerBio: freelancer.bio || '',
      freelancerPortfolio: freelancer.portfolio || [],
      baseScore: baseScore || 0,
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Generate proposal ranking prompt
   * @param {Object} job - Sanitized job object
   * @param {Array<Object>} proposalsWithData - Array of { proposal, freelancer, contractHistory }
   * @returns {string} Rendered prompt
   */
  generateProposalRankingPrompt(job, proposalsWithData) {
    const template = this.getPrompt('proposalRanking');
    
    // Format budget
    const budgetStr = this.formatBudget(job);
    
    // Format freelancer data
    const freelancerDataArray = proposalsWithData.map(({ proposal, freelancer, contractHistory }) => {
      const history = contractHistory || {};
      return `
### Freelancer: ${freelancer.name || 'Unknown'}
- **Proposal ID**: ${proposal._id || proposal.id}
- **Cover Letter**: ${(proposal.coverLetter || '').substring(0, 500)}${proposal.coverLetter && proposal.coverLetter.length > 500 ? '...' : ''}
- **Bid Amount**: PKR ${(proposal.bidAmount || 0).toLocaleString()}
- **Delivery Time**: ${proposal.deliveryTime || 'N/A'} days
- **Skills**: ${(freelancer.skills || []).join(', ') || 'None'}
- **Experience Level**: ${freelancer.experience || 'Not specified'}
- **Hourly Rate**: PKR ${(freelancer.hourlyRate || 0).toLocaleString()}/hr
- **Bio**: ${(freelancer.bio || '').substring(0, 200)}${freelancer.bio && freelancer.bio.length > 200 ? '...' : ''}
- **Portfolio Items**: ${(freelancer.portfolio || []).length || 0}
- **Contract History**:
  - Total Contracts: ${history.totalContracts || 0}
  - Completed: ${history.completedContracts || 0}
  - Success Rate: ${history.successRate || 0}%
  - On-Time Delivery Rate: ${history.onTimeDeliveryRate || 0}%
  - Dispute Rate: ${history.disputeRate || 0}%
  - Total Earned: PKR ${(history.totalEarned || 0).toLocaleString()}
  - Average Contract Value: PKR ${(history.averageContractValue || 0).toLocaleString()}
  - Has History: ${history.hasHistory ? 'Yes' : 'No (New Freelancer)'}
`;
    }).join('\n---\n');
    
    const variables = {
      jobTitle: job.title || '',
      jobDescription: (job.description || '').substring(0, 1000),
      jobSkills: (job.skills || []).join(', ') || 'Not specified',
      jobBudget: budgetStr,
      jobExperienceLevel: job.experienceLevel || 'Not specified',
      jobLocation: job.location || 'Not specified',
      freelancerData: freelancerDataArray,
    };

    return this.renderPrompt(template, variables);
  }

  /**
   * Format budget for prompt
   * @param {Object} job - Job object
   * @returns {string} Formatted budget string
   */
  formatBudget(job) {
    if (job.budgetType === 'fixed' && job.budgetAmount) {
      return `PKR ${job.budgetAmount.toLocaleString()} (Fixed)`;
    } else if (job.budgetMin && job.budgetMax) {
      return `PKR ${job.budgetMin.toLocaleString()} - ${job.budgetMax.toLocaleString()}`;
    } else if (job.budgetType === 'hourly' && job.hourlyRate) {
      const min = job.hourlyRate.min || 0;
      const max = job.hourlyRate.max || 0;
      return `PKR ${min.toLocaleString()}-${max.toLocaleString()}/hour`;
    }
    return 'Not specified';
  }
}

// Export singleton instance
export default new PromptManager();




