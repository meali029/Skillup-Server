/**
 * Subscription & Plan Configuration
 * Centralized plan limits, pricing, and feature flags for SkillUp Pakistan
 *
 * Currency: PKR (Pakistani Rupee)
 * Tiers: free, lite, pro, business
 */

// Plan name enum
export const PLAN_NAMES = {
  FREE: 'free',
  LITE: 'lite',
  PRO: 'pro',
  BUSINESS: 'business',
};

// Subscription status enum
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PAST_DUE: 'past_due',
};

// Billing cycle enum
export const BILLING_CYCLE = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

// Plan limits & features for each tier
// proposals/aiRequests/jobPosts: -1 means unlimited
export const PLAN_LIMITS = {
  [PLAN_NAMES.FREE]: {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    proposals: 20,
    aiRequests: 5,
    jobPosts: 3,
    commissionRate: 5, // 5%
    features: {
      aiProposalDraft: true,
      aiBidSuggestion: false,
      aiMatchEnhancement: false,
      prioritySupport: false,
      profileBoost: false,
      advancedAnalytics: false,
      fastWithdrawal: false,
    },
    badge: null,
    withdrawalDays: 7,
  },

  [PLAN_NAMES.LITE]: {
    name: 'Lite',
    price: { monthly: 999, yearly: 9990 },
    proposals: 50,
    aiRequests: 25,
    jobPosts: 10,
    commissionRate: 4, // 4%
    features: {
      aiProposalDraft: true,
      aiBidSuggestion: false,
      aiMatchEnhancement: false,
      prioritySupport: false,
      profileBoost: false,
      advancedAnalytics: false,
      fastWithdrawal: false,
    },
    badge: 'lite',
    withdrawalDays: 5,
  },

  [PLAN_NAMES.PRO]: {
    name: 'Pro',
    price: { monthly: 2499, yearly: 24990 },
    proposals: 150,
    aiRequests: 100,
    jobPosts: 30,
    commissionRate: 3, // 3%
    features: {
      aiProposalDraft: true,
      aiBidSuggestion: true,
      aiMatchEnhancement: true,
      prioritySupport: true,
      profileBoost: true,
      advancedAnalytics: false,
      fastWithdrawal: true,
    },
    badge: 'pro',
    withdrawalDays: 3,
  },

  [PLAN_NAMES.BUSINESS]: {
    name: 'Business',
    price: { monthly: 4999, yearly: 49990 },
    proposals: -1, // unlimited
    aiRequests: -1,
    jobPosts: -1,
    commissionRate: 2, // 2%
    features: {
      aiProposalDraft: true,
      aiBidSuggestion: true,
      aiMatchEnhancement: true,
      prioritySupport: true,
      profileBoost: true,
      advancedAnalytics: true,
      fastWithdrawal: true,
    },
    badge: 'business',
    withdrawalDays: 1,
  },
};

/**
 * Get plan limits for a given plan name (defaults to free)
 * @param {string} planName
 * @returns {Object} plan limits object
 */
export function getPlanLimits(planName) {
  return PLAN_LIMITS[planName] || PLAN_LIMITS[PLAN_NAMES.FREE];
}

/**
 * Get a specific feature flag for a plan
 * @param {string} planName
 * @param {string} featureName
 * @returns {boolean}
 */
export function getPlanFeature(planName, featureName) {
  const limits = getPlanLimits(planName);
  return !!limits.features[featureName];
}

/**
 * Tier ordering for upgrade/downgrade validation
 * Higher number = higher tier
 */
export const PLAN_TIER_ORDER = {
  [PLAN_NAMES.FREE]: 0,
  [PLAN_NAMES.LITE]: 1,
  [PLAN_NAMES.PRO]: 2,
  [PLAN_NAMES.BUSINESS]: 3,
};

export default {
  PLAN_NAMES,
  SUBSCRIPTION_STATUS,
  BILLING_CYCLE,
  PLAN_LIMITS,
  getPlanLimits,
  getPlanFeature,
  PLAN_TIER_ORDER,
};
