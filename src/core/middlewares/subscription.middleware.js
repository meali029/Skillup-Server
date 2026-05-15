import Subscription from '../../models/Subscription.js';
import User from '../../models/User.js';
import { getPlanLimits, getPlanFeature } from '../../config/subscription.config.js';
import { createAppError } from '../errors/index.js';

// Rolling window for free-tier AI counting
const FREE_AI_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Middleware factory: check if user has remaining quota for a resource
 * @param {'proposals'|'aiRequests'|'jobPosts'} resource
 */
export function checkPlanLimit(resource) {
  const fieldMap = {
    proposals: 'proposalsUsed',
    aiRequests: 'aiRequestsUsed',
    jobPosts: 'jobsPosted',
  };

  return async (req, res, next) => {
    try {
      const planName = req.user?.plan || 'free';
      const limits = getPlanLimits(planName);

      const limit = limits[resource];
      // -1 means unlimited
      if (limit === -1) return next();

      let used = 0;

      // Free-tier AI: read from User model (7-day rolling window)
      if (resource === 'aiRequests' && planName === 'free') {
        const user = await User.findById(req.user.id).select('aiRequestsUsed aiRequestsResetAt');
        if (user) {
          const windowExpired = !user.aiRequestsResetAt ||
            (Date.now() - new Date(user.aiRequestsResetAt).getTime()) > FREE_AI_WINDOW_MS;
          used = windowExpired ? 0 : (user.aiRequestsUsed || 0);
        }
        // Tag request so aiRateLimit knows where to track
        req._aiUsageSource = 'user';
      } else {
        // Paid plans: read from Subscription model
        const subscription = await Subscription.getActiveSubscription(req.user.id);
        used = subscription?.usage?.[fieldMap[resource]] || 0;
        if (resource === 'aiRequests') {
          req._aiUsageSource = 'subscription';
        }
      }

      if (used >= limit) {
        const error = createAppError(
          `You have reached your ${resource} limit (${limit}) on the ${planName} plan. Upgrade to continue.`,
          403
        );
        error.code = 'PLAN_LIMIT_REACHED';
        error.details = { plan: planName, limit, used, remaining: 0 };
        return next(error);
      }

      // Attach remaining count for downstream use
      req._planUsage = { resource, used, limit, remaining: limit - used };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory: check if user's plan includes a specific feature
 * @param {string} featureName - key in plan.features (e.g. 'aiProposalDraft')
 */
export function checkFeatureAccess(featureName) {
  return (req, res, next) => {
    const planName = req.user?.plan || 'free';
    const hasAccess = getPlanFeature(planName, featureName);

    if (!hasAccess) {
      const error = createAppError(
        `The ${featureName} feature is not available on your current plan (${planName}). Please upgrade.`,
        403
      );
      error.code = 'FEATURE_LOCKED';
      return next(error);
    }

    next();
  };
}
