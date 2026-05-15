import mongoose from 'mongoose';
import Subscription from '../../models/Subscription.js';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';
import Wallet from '../../models/Wallet.js';
import PlatformWallet from '../../models/PlatformWallet.js';
import { createAppError } from '../../core/errors/index.js';
import {
  PLAN_LIMITS,
  PLAN_NAMES,
  SUBSCRIPTION_STATUS,
  PLAN_TIER_ORDER,
  getPlanLimits,
} from '../../config/subscription.config.js';
import {
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
} from '../payments/payment.constants.js';
import { generateIdempotencyKey } from '../../config/payment.config.js';
import safepayService from '../../services/paymentGateways/safepay.service.js';
import invoiceService from '../../services/invoice.service.js';
import logger from '../../core/utils/logger.js';

class SubscriptionService {
  /**
   * Return all plans with pricing
   */
  getPlans() {
    return Object.entries(PLAN_LIMITS).map(([key, plan]) => ({
      id: key,
      ...plan,
    }));
  }

  /**
   * Get the current active subscription (or free defaults) for a user
   */
  async getCurrentSubscription(userId) {
    const user = await User.findById(userId).select('plan subscriptionId');
    if (!user) throw createAppError('User not found', 404);

    const planName = user.plan || PLAN_NAMES.FREE;
    const limits = getPlanLimits(planName);

    let subscription = null;
    if (user.subscriptionId) {
      subscription = await Subscription.findById(user.subscriptionId);
    }

    return {
      plan: planName,
      limits,
      subscription,
    };
  }

  /**
   * Purchase a subscription plan
   * @param {string} userId
   * @param {string} plan - lite | pro | business
   * @param {string} billingCycle - monthly | yearly
   * @param {string} paymentMethod - WALLET | SAFEPAY
   */
  async purchaseSubscription(userId, plan, billingCycle, paymentMethod) {
    if (plan === PLAN_NAMES.FREE) {
      throw createAppError('Cannot purchase the free plan', 400);
    }

    const planConfig = PLAN_LIMITS[plan];
    if (!planConfig) throw createAppError('Invalid plan', 400);

    // Check for existing active subscription
    const existing = await Subscription.getActiveSubscription(userId);
    if (existing) {
      throw createAppError(
        'You already have an active subscription. Cancel it first or wait for it to expire.',
        400
      );
    }

    const amount = planConfig.price[billingCycle];
    if (!amount || amount <= 0) {
      throw createAppError('Invalid billing cycle for this plan', 400);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    if (paymentMethod === 'WALLET') {
      return this._purchaseViaWallet(userId, plan, billingCycle, amount, now, periodEnd);
    }

    if (paymentMethod === 'SAFEPAY') {
      return this._purchaseViaSafepay(userId, plan, billingCycle, amount, now, periodEnd);
    }

    throw createAppError('Unsupported payment method', 400);
  }

  /**
   * Wallet-based purchase (immediate activation)
   */
  async _purchaseViaWallet(userId, plan, billingCycle, amount, periodStart, periodEnd) {
    const idempotencyKey = generateIdempotencyKey('SUB');

    const session = await mongoose.startSession();
    try {
      let subscription, transaction;

      await session.withTransaction(async () => {
        // 1. Debit user wallet
        const wallet = await Wallet.findOne({ userId }).session(session);
        if (!wallet || wallet.availableBalance < amount) {
          throw createAppError('Insufficient wallet balance', 400);
        }
        await Wallet.atomicDebit(userId, amount, session);

        // 2. Get user's current plan before updating
        const user = await User.findById(userId).session(session);
        const previousPlan = user.plan || PLAN_NAMES.FREE;

        // 3. Create transaction
        [transaction] = await Transaction.create(
          [
            {
              idempotencyKey,
              userId,
              type: TRANSACTION_TYPE.SUBSCRIPTION,
              direction: 'DEBIT',
              amount,
              netAmount: amount,
              currency: 'PKR',
              status: TRANSACTION_STATUS.SUCCESS,
              paymentMethod: 'WALLET',
              description: `Subscription: ${plan} (${billingCycle})`,
              completedAt: new Date(),
            },
          ],
          { session }
        );

        // 4. Create subscription
        [subscription] = await Subscription.create(
          [
            {
              userId,
              plan,
              status: SUBSCRIPTION_STATUS.ACTIVE,
              billingCycle,
              amount,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              paymentMethod: 'WALLET',
              transactionId: transaction._id,
              previousPlan,
              usage: { usageResetAt: periodStart },
            },
          ],
          { session }
        );

        // 5. Update user
        await User.findByIdAndUpdate(
          userId,
          { plan, subscriptionId: subscription._id },
          { session }
        );

        // 6. Credit platform wallet
        await PlatformWallet.addFee(amount, session);
      });

      // Generate invoice (outside transaction — non-critical)
      try {
        await invoiceService.createInvoice({
          userId,
          subscriptionId: subscription._id,
          transactionId: transaction._id,
          type: 'subscription',
          plan,
          billingCycle,
          amount,
          periodStart,
          periodEnd,
        });
      } catch (err) {
        logger.error(`[Invoice] Failed to create invoice for user ${userId}:`, err.message);
      }

      return { subscription, transaction };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Safepay-based purchase (pending until callback)
   */
  async _purchaseViaSafepay(userId, plan, billingCycle, amount, periodStart, periodEnd) {
    const orderId = `SUB_${Date.now()}_${userId}`;

    // 1. Create pending transaction
    const transaction = await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.SUBSCRIPTION,
      direction: 'DEBIT',
      amount,
      netAmount: amount,
      currency: 'PKR',
      status: TRANSACTION_STATUS.PENDING,
      paymentMethod: 'SAFEPAY',
      gatewayTransactionId: orderId,
      description: `Subscription: ${plan} (${billingCycle})`,
      metadata: new Map([
        ['plan', plan],
        ['billingCycle', billingCycle],
        ['periodStart', periodStart.toISOString()],
        ['periodEnd', periodEnd.toISOString()],
      ]),
    });

    // 2. Init Safepay session
    const paymentResponse = await safepayService.initializePayment({
      amount,
      orderId,
    });

    // Update transaction with tracker
    transaction.gatewayTransactionId =
      paymentResponse.transactionRef || orderId;
    await transaction.save();

    return {
      transactionId: transaction._id.toString(),
      paymentUrl: paymentResponse.paymentUrl,
      amount,
    };
  }

  /**
   * Called after Safepay callback confirms payment
   */
  async activateAfterPayment(transactionId) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) throw createAppError('Transaction not found', 404);
    if (transaction.type !== TRANSACTION_TYPE.SUBSCRIPTION) {
      throw createAppError('Not a subscription transaction', 400);
    }
    if (transaction.status !== TRANSACTION_STATUS.PENDING) {
      throw createAppError('Transaction already processed', 400);
    }

    const plan = transaction.metadata?.get('plan');
    const billingCycle = transaction.metadata?.get('billingCycle');
    const periodStart = new Date(transaction.metadata?.get('periodStart'));
    const periodEnd = new Date(transaction.metadata?.get('periodEnd'));

    const session = await mongoose.startSession();
    try {
      let subscription;

      await session.withTransaction(async () => {
        const user = await User.findById(transaction.userId).session(session);
        const previousPlan = transaction.metadata?.get('previousPlan') || user.plan || PLAN_NAMES.FREE;
        const isUpgrade = transaction.metadata?.get('isUpgrade') === 'true';
        const fullAmount = transaction.metadata?.get('fullAmount')
          ? Number(transaction.metadata.get('fullAmount'))
          : transaction.amount;

        // If this is an upgrade, expire the previous subscription
        if (isUpgrade) {
          const previousSubId = transaction.metadata?.get('previousSubId');
          if (previousSubId) {
            await Subscription.findByIdAndUpdate(
              previousSubId,
              { status: SUBSCRIPTION_STATUS.EXPIRED, scheduledDowngrade: undefined },
              { session }
            );
          }
        }

        transaction.status = TRANSACTION_STATUS.SUCCESS;
        transaction.completedAt = new Date();
        await transaction.save({ session });

        [subscription] = await Subscription.create(
          [
            {
              userId: transaction.userId,
              plan,
              status: SUBSCRIPTION_STATUS.ACTIVE,
              billingCycle,
              amount: fullAmount,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              paymentMethod: 'SAFEPAY',
              transactionId: transaction._id,
              previousPlan,
              upgradedAt: isUpgrade ? new Date() : undefined,
              usage: { usageResetAt: periodStart },
            },
          ],
          { session }
        );

        await User.findByIdAndUpdate(
          transaction.userId,
          { plan, subscriptionId: subscription._id },
          { session }
        );

        await PlatformWallet.addFee(transaction.amount, session);
      });

      // Generate invoice (outside transaction — non-critical)
      try {
        const proratedCredit = transaction.metadata?.get('proratedCredit')
          ? Number(transaction.metadata.get('proratedCredit'))
          : 0;
        const isUpgrade = transaction.metadata?.get('isUpgrade') === 'true';
        await invoiceService.createInvoice({
          userId: transaction.userId,
          subscriptionId: subscription._id,
          transactionId: transaction._id,
          type: isUpgrade ? 'upgrade' : 'subscription',
          plan,
          billingCycle,
          amount: transaction.amount,
          proratedCredit,
          periodStart,
          periodEnd,
        });
      } catch (err) {
        logger.error(`[Invoice] Failed to create invoice for Safepay activation:`, err.message);
      }

      return { subscription, transaction };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(userId, reason) {
    const subscription = await Subscription.getActiveSubscription(userId);
    if (!subscription) {
      throw createAppError('No active subscription found', 404);
    }

    subscription.cancelAtPeriodEnd = true;
    subscription.cancelledAt = new Date();
    subscription.cancellationReason = reason || undefined;
    await subscription.save();

    return subscription;
  }

  /**
   * Undo cancellation (before period end)
   */
  async reactivateSubscription(userId) {
    const subscription = await Subscription.findOne({
      userId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      cancelAtPeriodEnd: true,
    });
    if (!subscription) {
      throw createAppError('No cancelled subscription found to reactivate', 404);
    }

    subscription.cancelAtPeriodEnd = false;
    subscription.cancelledAt = undefined;
    subscription.cancellationReason = undefined;
    await subscription.save();

    return subscription;
  }

  /**
   * Admin grants a plan to a user (no payment)
   */
  async adminGrantPlan(userId, plan, adminId, durationDays = 30) {
    const user = await User.findById(userId);
    if (!user) throw createAppError('User not found', 404);

    // Expire any existing active subscription
    await Subscription.updateMany(
      { userId, status: SUBSCRIPTION_STATUS.ACTIVE },
      { status: SUBSCRIPTION_STATUS.EXPIRED }
    );

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + durationDays);

    const previousPlan = user.plan || PLAN_NAMES.FREE;

    const subscription = await Subscription.create({
      userId,
      plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: 'monthly',
      amount: 0,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      paymentMethod: 'SYSTEM',
      previousPlan,
      grantedBy: adminId,
      usage: { usageResetAt: now },
    });

    await User.findByIdAndUpdate(userId, {
      plan,
      subscriptionId: subscription._id,
    });

    return subscription;
  }

  /**
   * Calculate proration credit for remaining days of current plan
   */
  _calculateProration(currentSub) {
    const now = Date.now();
    const periodStart = new Date(currentSub.currentPeriodStart).getTime();
    const periodEnd = new Date(currentSub.currentPeriodEnd).getTime();
    const totalDays = (periodEnd - periodStart) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.max(0, (periodEnd - now) / (1000 * 60 * 60 * 24));
    const credit = Math.round((daysRemaining / totalDays) * currentSub.amount);
    return { credit, daysRemaining: Math.ceil(daysRemaining), totalDays: Math.ceil(totalDays) };
  }

  /**
   * Upgrade subscription (mid-cycle with proration)
   * @param {string} userId
   * @param {string} newPlan
   * @param {string} billingCycle
   * @param {string} paymentMethod - WALLET | SAFEPAY
   */
  async upgradeSubscription(userId, newPlan, billingCycle, paymentMethod) {
    const currentSub = await Subscription.getActiveSubscription(userId);
    if (!currentSub) {
      // No active sub — just do a normal purchase
      return this.purchaseSubscription(userId, newPlan, billingCycle, paymentMethod);
    }

    const currentTier = PLAN_TIER_ORDER[currentSub.plan] ?? 0;
    const newTier = PLAN_TIER_ORDER[newPlan] ?? 0;
    if (newTier <= currentTier) {
      throw createAppError('Can only upgrade to a higher tier. Use downgrade for lower tiers.', 400);
    }

    const newPlanConfig = PLAN_LIMITS[newPlan];
    if (!newPlanConfig) throw createAppError('Invalid plan', 400);

    const newAmount = newPlanConfig.price[billingCycle];
    if (!newAmount || newAmount <= 0) {
      throw createAppError('Invalid billing cycle for this plan', 400);
    }

    // Calculate proration
    const { credit } = this._calculateProration(currentSub);
    const charge = Math.max(0, newAmount - credit);

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    if (paymentMethod === 'WALLET') {
      return this._upgradeViaWallet(userId, currentSub, newPlan, billingCycle, charge, newAmount, now, periodEnd);
    }

    if (paymentMethod === 'SAFEPAY') {
      return this._upgradeViaSafepay(userId, currentSub, newPlan, billingCycle, charge, newAmount, now, periodEnd, credit);
    }

    throw createAppError('Unsupported payment method', 400);
  }

  /**
   * Get proration details for preview (no side effects)
   */
  async getUpgradePreview(userId, newPlan, billingCycle) {
    const currentSub = await Subscription.getActiveSubscription(userId);
    const currentPlan = currentSub?.plan || PLAN_NAMES.FREE;
    const currentTier = PLAN_TIER_ORDER[currentPlan] ?? 0;
    const newTier = PLAN_TIER_ORDER[newPlan] ?? 0;

    if (newTier <= currentTier) {
      throw createAppError('Can only upgrade to a higher tier', 400);
    }

    const newPlanConfig = PLAN_LIMITS[newPlan];
    const newAmount = newPlanConfig.price[billingCycle];
    const { credit, daysRemaining } = currentSub
      ? this._calculateProration(currentSub)
      : { credit: 0, daysRemaining: 0 };
    const charge = Math.max(0, newAmount - credit);

    return {
      currentPlan,
      newPlan,
      billingCycle,
      newPlanPrice: newAmount,
      proratedCredit: credit,
      amountDue: charge,
      daysRemaining,
    };
  }

  async _upgradeViaWallet(userId, currentSub, newPlan, billingCycle, charge, fullAmount, periodStart, periodEnd) {
    const idempotencyKey = generateIdempotencyKey('UPG');
    const session = await mongoose.startSession();
    try {
      let subscription, transaction;

      await session.withTransaction(async () => {
        // 1. Debit wallet (prorated amount)
        if (charge > 0) {
          const wallet = await Wallet.findOne({ userId }).session(session);
          if (!wallet || wallet.availableBalance < charge) {
            throw createAppError('Insufficient wallet balance', 400);
          }
          await Wallet.atomicDebit(userId, charge, session);
        }

        // 2. Expire the current subscription
        currentSub.status = SUBSCRIPTION_STATUS.EXPIRED;
        currentSub.scheduledDowngrade = undefined;
        await currentSub.save({ session });

        // 3. Create transaction
        [transaction] = await Transaction.create(
          [
            {
              idempotencyKey,
              userId,
              type: TRANSACTION_TYPE.SUBSCRIPTION,
              direction: 'DEBIT',
              amount: charge,
              netAmount: charge,
              currency: 'PKR',
              status: TRANSACTION_STATUS.SUCCESS,
              paymentMethod: 'WALLET',
              description: `Upgrade: ${currentSub.plan} → ${newPlan} (${billingCycle})`,
              completedAt: new Date(),
            },
          ],
          { session }
        );

        // 4. Create new subscription
        [subscription] = await Subscription.create(
          [
            {
              userId,
              plan: newPlan,
              status: SUBSCRIPTION_STATUS.ACTIVE,
              billingCycle,
              amount: fullAmount,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              paymentMethod: 'WALLET',
              transactionId: transaction._id,
              previousPlan: currentSub.plan,
              upgradedAt: new Date(),
              usage: { usageResetAt: periodStart },
            },
          ],
          { session }
        );

        // 5. Update user
        await User.findByIdAndUpdate(userId, { plan: newPlan, subscriptionId: subscription._id }, { session });

        // 6. Credit platform wallet
        if (charge > 0) {
          await PlatformWallet.addFee(charge, session);
        }
      });

      // Generate invoice (outside transaction — non-critical)
      try {
        await invoiceService.createInvoice({
          userId,
          subscriptionId: subscription._id,
          transactionId: transaction._id,
          type: 'upgrade',
          plan: newPlan,
          billingCycle,
          amount: charge,
          proratedCredit: fullAmount - charge,
          periodStart,
          periodEnd,
        });
      } catch (err) {
        logger.error(`[Invoice] Failed to create upgrade invoice for user ${userId}:`, err.message);
      }

      return { subscription, transaction };
    } finally {
      await session.endSession();
    }
  }

  async _upgradeViaSafepay(userId, currentSub, newPlan, billingCycle, charge, fullAmount, periodStart, periodEnd, credit) {
    if (charge <= 0) {
      // No charge needed — activate directly as wallet upgrade with 0 charge
      return this._upgradeViaWallet(userId, currentSub, newPlan, billingCycle, 0, fullAmount, periodStart, periodEnd);
    }

    const orderId = `UPG_${Date.now()}_${userId}`;

    const transaction = await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.SUBSCRIPTION,
      direction: 'DEBIT',
      amount: charge,
      netAmount: charge,
      currency: 'PKR',
      status: TRANSACTION_STATUS.PENDING,
      paymentMethod: 'SAFEPAY',
      gatewayTransactionId: orderId,
      description: `Upgrade: ${currentSub.plan} → ${newPlan} (${billingCycle})`,
      metadata: new Map([
        ['plan', newPlan],
        ['billingCycle', billingCycle],
        ['periodStart', periodStart.toISOString()],
        ['periodEnd', periodEnd.toISOString()],
        ['isUpgrade', 'true'],
        ['previousPlan', currentSub.plan],
        ['previousSubId', currentSub._id.toString()],
        ['fullAmount', fullAmount.toString()],
        ['proratedCredit', credit.toString()],
      ]),
    });

    const paymentResponse = await safepayService.initializePayment({
      amount: charge,
      orderId,
    });

    transaction.gatewayTransactionId = paymentResponse.transactionRef || orderId;
    await transaction.save();

    return {
      transactionId: transaction._id.toString(),
      paymentUrl: paymentResponse.paymentUrl,
      amount: charge,
      proratedCredit: credit,
    };
  }

  /**
   * Schedule a downgrade (takes effect at period end)
   */
  async scheduleDowngrade(userId, newPlan) {
    const currentSub = await Subscription.getActiveSubscription(userId);
    if (!currentSub) {
      throw createAppError('No active subscription found', 404);
    }

    const currentTier = PLAN_TIER_ORDER[currentSub.plan] ?? 0;
    const newTier = PLAN_TIER_ORDER[newPlan] ?? 0;
    if (newTier >= currentTier) {
      throw createAppError('Can only downgrade to a lower tier. Use upgrade for higher tiers.', 400);
    }

    currentSub.scheduledDowngrade = { plan: newPlan, scheduledAt: new Date() };
    currentSub.cancelAtPeriodEnd = false; // downgrade overrides cancel
    await currentSub.save();

    return currentSub;
  }

  /**
   * Cancel a scheduled downgrade
   */
  async cancelScheduledDowngrade(userId) {
    const currentSub = await Subscription.findOne({
      userId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      'scheduledDowngrade.plan': { $exists: true },
    });
    if (!currentSub) {
      throw createAppError('No scheduled downgrade found', 404);
    }

    currentSub.scheduledDowngrade = undefined;
    await currentSub.save();

    return currentSub;
  }

  /**
   * Get usage stats for a user
   */
  async getUsage(userId) {
    const user = await User.findById(userId).select('plan aiRequestsUsed aiRequestsResetAt');
    if (!user) throw createAppError('User not found', 404);

    const planName = user.plan || PLAN_NAMES.FREE;
    const limits = getPlanLimits(planName);

    const subscription = await Subscription.getActiveSubscription(userId);
    const usage = subscription?.usage || {
      proposalsUsed: 0,
      aiRequestsUsed: 0,
      jobsPosted: 0,
    };

    // Free-tier AI: read from User model with 7-day window
    let aiUsed = usage.aiRequestsUsed;
    if (planName === 'free') {
      const FREE_AI_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
      const windowExpired = !user.aiRequestsResetAt ||
        (Date.now() - new Date(user.aiRequestsResetAt).getTime()) > FREE_AI_WINDOW_MS;
      aiUsed = windowExpired ? 0 : (user.aiRequestsUsed || 0);
    }

    return {
      plan: planName,
      usage: {
        proposals: { used: usage.proposalsUsed, limit: limits.proposals },
        aiRequests: { used: aiUsed, limit: limits.aiRequests },
        jobPosts: { used: usage.jobsPosted, limit: limits.jobPosts },
      },
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
    };
  }

  /**
   * Increment usage counter (called after action succeeds)
   * @param {string} userId
   * @param {string} resource - 'proposals' | 'aiRequests' | 'jobPosts'
   */
  async incrementUsage(userId, resource) {
    const fieldMap = {
      proposals: 'proposalsUsed',
      aiRequests: 'aiRequestsUsed',
      jobPosts: 'jobsPosted',
    };
    const field = fieldMap[resource];
    if (!field) throw createAppError(`Invalid resource: ${resource}`, 400);

    return Subscription.incrementUsage(userId, field);
  }

  /**
   * Get subscription stats for admin dashboard
   */
  async getStats() {
    const [planCounts, activeSubs, revenue] = await Promise.all([
      User.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      Subscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
      Transaction.aggregate([
        {
          $match: {
            type: { $in: [TRANSACTION_TYPE.SUBSCRIPTION, TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL] },
            status: TRANSACTION_STATUS.SUCCESS,
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      planDistribution: planCounts.reduce((acc, { _id, count }) => {
        acc[_id || 'free'] = count;
        return acc;
      }, {}),
      activeSubscriptions: activeSubs,
      totalRevenue: revenue[0]?.total || 0,
      totalTransactions: revenue[0]?.count || 0,
    };
  }

  /**
   * Get subscription metrics time series from daily snapshots
   * @param {number} days - number of days to look back (default 30, max 365)
   */
  async getMetrics(days = 30) {
    const { default: SubscriptionMetrics } = await import('../../models/SubscriptionMetrics.js');
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const metrics = await SubscriptionMetrics.find({
      date: { $gte: since },
    })
      .sort({ date: 1 })
      .lean();

    // Compute summary from the latest snapshot
    const latest = metrics[metrics.length - 1] || {};
    const earliest = metrics[0] || {};

    return {
      timeSeries: metrics,
      summary: {
        currentMRR: latest.mrr || 0,
        activeSubscriptions: latest.activeSubscriptions || 0,
        planDistribution: latest.planDistribution || {},
        totalChurned: metrics.reduce((sum, m) => sum + (m.churned || 0), 0),
        totalNewSubscriptions: metrics.reduce((sum, m) => sum + (m.newSubscriptions || 0), 0),
        totalRevenue: metrics.reduce((sum, m) => sum + (m.dailyRevenue || 0), 0),
        mrrGrowth: earliest.mrr ? Math.round(((latest.mrr - earliest.mrr) / earliest.mrr) * 100) : 0,
      },
    };
  }
}

export default new SubscriptionService();
