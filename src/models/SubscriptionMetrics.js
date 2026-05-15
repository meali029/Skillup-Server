import mongoose from 'mongoose';

const subscriptionMetricsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    // Plan distribution snapshot
    planDistribution: {
      free: { type: Number, default: 0 },
      lite: { type: Number, default: 0 },
      pro: { type: Number, default: 0 },
      business: { type: Number, default: 0 },
    },
    // Active subscriptions (non-free)
    activeSubscriptions: { type: Number, default: 0 },
    // Monthly Recurring Revenue (PKR) — sum of active monthly equivalent amounts
    mrr: { type: Number, default: 0 },
    // New subscriptions created today
    newSubscriptions: { type: Number, default: 0 },
    // Churned subscriptions (expired/cancelled today)
    churned: { type: Number, default: 0 },
    // Renewals processed today
    renewals: { type: Number, default: 0 },
    // Failed renewals (entered grace period) today
    failedRenewals: { type: Number, default: 0 },
    // Revenue collected today (PKR)
    dailyRevenue: { type: Number, default: 0 },
    // Upgrade/downgrade counts
    upgrades: { type: Number, default: 0 },
    downgrades: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.SubscriptionMetrics ||
  mongoose.model('SubscriptionMetrics', subscriptionMetricsSchema);
