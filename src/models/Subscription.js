import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'lite', 'pro', 'business'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'past_due'],
      default: 'active',
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    paymentMethod: {
      type: String,
      enum: ['WALLET', 'SAFEPAY', 'SYSTEM'],
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    // Usage tracking (reset each billing period)
    usage: {
      proposalsUsed: { type: Number, default: 0, min: 0 },
      aiRequestsUsed: { type: Number, default: 0, min: 0 },
      jobsPosted: { type: Number, default: 0, min: 0 },
      usageResetAt: { type: Date },
    },
    previousPlan: {
      type: String,
      enum: ['free', 'lite', 'pro', 'business'],
    },
    upgradedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    // Scheduled downgrade (takes effect at period end)
    scheduledDowngrade: {
      plan: { type: String, enum: ['free', 'lite', 'pro', 'business'] },
      scheduledAt: { type: Date },
    },
    // Grace period for failed renewals
    gracePeriodEnd: { type: Date },
    // Track renewal reminder emails to avoid duplicates
    lastReminderSentAt: { type: Date },
    // Track usage-approaching alerts (80% threshold)
    lastUsageAlertSentAt: { type: Date },
    // Track grace period dunning reminders sent (day 1, day 2, day 3)
    gracePeriodRemindersSent: { type: Number, default: 0, min: 0, max: 3 },
    // Admin grant fields
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

/**
 * Get the active subscription for a user (only one can be active at a time)
 */
subscriptionSchema.statics.getActiveSubscription = async function (userId) {
  return this.findOne({ userId, status: 'active' });
};

/**
 * Atomically increment a usage field for the active subscription
 * @param {string} userId
 * @param {string} field - one of 'proposalsUsed', 'aiRequestsUsed', 'jobsPosted'
 * @returns {Object|null} updated subscription or null
 */
subscriptionSchema.statics.incrementUsage = async function (userId, field) {
  const allowed = ['proposalsUsed', 'aiRequestsUsed', 'jobsPosted'];
  if (!allowed.includes(field)) {
    throw new Error(`Invalid usage field: ${field}`);
  }
  return this.findOneAndUpdate(
    { userId, status: 'active' },
    { $inc: { [`usage.${field}`]: 1 } },
    { new: true }
  );
};

export default mongoose.models.Subscription ||
  mongoose.model('Subscription', subscriptionSchema);
