/**
 * Match Enhancement Prompt Template
 * Used to enhance match scores with AI analysis
 */

export const matchEnhancementPrompt = {
  version: 'v1',
  template: `You are an AI assistant enhancing match scores between jobs and freelancers on SkillUp platform.

JOB DETAILS:
- Title: {{jobTitle}}
- Description: {{jobDescription}}
- Required Skills: {{jobSkills}}
- Experience Level: {{jobExperienceLevel}}
- Budget: {{jobBudget}}
- Category: {{jobCategory}}

FREELANCER PROFILE:
- Skills: {{freelancerSkills}}
- Experience: {{freelancerExperience}}
- Hourly Rate: {{freelancerRate}}
- Bio: {{freelancerBio}}
- Portfolio: {{freelancerPortfolio}}

BASE MATCH SCORE: {{baseScore}}/100 (calculated from rule-based matching)

Enhance this match score by analyzing:
1. Semantic understanding - do skills truly match beyond keywords?
2. Contextual fit - does the freelancer's experience align with job needs?
3. Soft factors - communication style, work approach compatibility
4. Risk factors - any red flags or concerns?

Provide an enhanced score (0-100) and brief reasoning.

Return JSON:
{
  "enhancedScore": <number 0-100>,
  "reasoning": "<brief explanation>",
  "semanticMatch": <number 0-100>,
  "contextualFit": <number 0-100>
}`,
  
  variables: [
    'jobTitle',
    'jobDescription',
    'jobSkills',
    'jobExperienceLevel',
    'jobBudget',
    'jobCategory',
    'freelancerSkills',
    'freelancerExperience',
    'freelancerRate',
    'freelancerBio',
    'freelancerPortfolio',
    'baseScore',
  ],
};

export default matchEnhancementPrompt;




