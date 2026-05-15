import Joi from 'joi';

export const purchaseSubscription = Joi.object({
  plan: Joi.string()
    .valid('lite', 'pro', 'business')
    .required()
    .messages({
      'any.only': 'Plan must be lite, pro, or business',
      'any.required': 'Plan is required',
    }),
  billingCycle: Joi.string()
    .valid('monthly', 'yearly')
    .default('monthly')
    .messages({
      'any.only': 'Billing cycle must be monthly or yearly',
    }),
  paymentMethod: Joi.string()
    .valid('WALLET', 'SAFEPAY')
    .required()
    .messages({
      'any.only': 'Payment method must be WALLET or SAFEPAY',
      'any.required': 'Payment method is required',
    }),
});

export const cancelSubscription = Joi.object({
  reason: Joi.string().max(500).optional().allow('', null),
});

export const adminGrantPlan = Joi.object({
  userId: Joi.string().required().messages({
    'any.required': 'User ID is required',
  }),
  plan: Joi.string()
    .valid('free', 'lite', 'pro', 'business')
    .required()
    .messages({
      'any.only': 'Plan must be free, lite, pro, or business',
      'any.required': 'Plan is required',
    }),
  durationDays: Joi.number().integer().min(1).max(365).default(30).messages({
    'number.min': 'Duration must be at least 1 day',
    'number.max': 'Duration cannot exceed 365 days',
  }),
});

export const upgradeSubscription = Joi.object({
  plan: Joi.string()
    .valid('lite', 'pro', 'business')
    .required()
    .messages({
      'any.only': 'Plan must be lite, pro, or business',
      'any.required': 'Plan is required',
    }),
  billingCycle: Joi.string()
    .valid('monthly', 'yearly')
    .default('monthly')
    .messages({
      'any.only': 'Billing cycle must be monthly or yearly',
    }),
  paymentMethod: Joi.string()
    .valid('WALLET', 'SAFEPAY')
    .required()
    .messages({
      'any.only': 'Payment method must be WALLET or SAFEPAY',
      'any.required': 'Payment method is required',
    }),
});

export const downgradeSubscription = Joi.object({
  plan: Joi.string()
    .valid('free', 'lite', 'pro')
    .required()
    .messages({
      'any.only': 'Plan must be free, lite, or pro',
      'any.required': 'Plan is required',
    }),
});

export const upgradePreview = Joi.object({
  plan: Joi.string()
    .valid('lite', 'pro', 'business')
    .required()
    .messages({
      'any.only': 'Plan must be lite, pro, or business',
      'any.required': 'Plan is required',
    }),
  billingCycle: Joi.string()
    .valid('monthly', 'yearly')
    .default('monthly'),
});
