export const JOB_SCHEDULES = Object.freeze({
  subscriptionRenewal: '0 * * * *',
  subscriptionAnalyticsSnapshot: '0 0 * * *',
  safepayVerifier: '*/2 * * * *',
  adminWeeklyReport: '0 9 * * 1',
  adminMonthlyReport: '0 9 1 * *',
});

export const JOB_LIMITS = Object.freeze({
  safepayVerifierBatchSize: 50,
});

export const JOB_INTERVALS = Object.freeze({
  aiRateLimitCleanupMs: 5 * 60 * 1000,
});

export const QUEUE_NAMES = Object.freeze({
  email: 'email-queue',
  ocr: 'ocr-queue',
});

export const JOB_NAMES = Object.freeze({
  emailVerification: 'send-verification',
  emailOtp: 'send-otp',
  emailPasswordReset: 'send-password-reset',
  emailSubscription: 'send-subscription-email',
  emailCampaign: 'send-email-campaign',
  cnicOcr: 'extract-cnic',
});

export const JOB_OPTIONS = Object.freeze({
  emailRetry: Object.freeze({
    attempts: 3,
    backoff: Object.freeze({ type: 'exponential', delay: 5000 }),
  }),
  ocrRetry: Object.freeze({
    attempts: 2,
    backoff: Object.freeze({ type: 'exponential', delay: 10000 }),
  }),
});

export const WORKER_CONCURRENCY = Object.freeze({
  email: 5,
  ocr: 2,
});

export default {
  JOB_SCHEDULES,
  JOB_LIMITS,
  JOB_INTERVALS,
  QUEUE_NAMES,
  JOB_NAMES,
  JOB_OPTIONS,
  WORKER_CONCURRENCY,
};
