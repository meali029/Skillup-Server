/**
 * Job Recommendation Prompt Template
 * Used to generate prompts for AI-powered job recommendations
 */

export const jobRecommendationPrompt = {
  version: 'v1',
  template: `You are an AI assistant helping match freelancers with jobs on SkillUp platform.

JOB DETAILS:
- Title: {{jobTitle}}
- Description: {{jobDescription}}
- Required Skills: {{jobSkills}}
- Experience Level: {{jobExperienceLevel}}
- Budget: {{jobBudget}}
- Category: {{jobCategory}}
- Duration: {{jobDuration}}

FREELANCER PROFILE:
- Skills: {{freelancerSkills}}
- Experience: {{freelancerExperience}}
- Hourly Rate: {{freelancerRate}}
- Bio: {{freelancerBio}}
- Portfolio Items: {{freelancerPortfolio}}

Analyze the match and provide:
1. Match score (0-100) - how well the freelancer fits this job
2. Key strengths - what makes this a good match
3. Potential concerns - any mismatches or risks
4. Recommendation reasoning - brief explanation

Return your response as valid JSON only:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "reasoning": "<brief explanation in 2-3 sentences>"
}`,
  
  variables: [
    'jobTitle',
    'jobDescription',
    'jobSkills',
    'jobExperienceLevel',
    'jobBudget',
    'jobCategory',
    'jobDuration',
    'freelancerSkills',
    'freelancerExperience',
    'freelancerRate',
    'freelancerBio',
    'freelancerPortfolio',
  ],
};

export default jobRecommendationPrompt;




