import cron from 'node-cron';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import SubscriptionMetrics from '../models/SubscriptionMetrics.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import PlatformWallet from '../models/PlatformWallet.js';
import { notifyUser } from '../modules/notifications/notification.service.js';
import { sendSubscriptionEmail } from '../core/utils/emailService.js';
import {
  PLAN_NAMES,
  PLAN_LIMITS,
  SUBSCRIPTION_STATUS,
} from '../config/subscription.config.js';
import {
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
} from '../modules/payments/payment.constants.js';
import { generateIdempotencyKey } from '../config/payment.config.js';
import logger from '../core/utils/logger.js';
import invoiceService from '../services/invoice.service.js';

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Process expired active subscriptions
 */
async function processExpiredSubscriptions() {
  const now = new Date();

  const expiredSubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $lte: now },
  }).limit(100);

  for (const sub of expiredSubs) {
    try {
      // 1. Cancelled at period end — just expire
      if (sub.cancelAtPeriodEnd) {
        await expireSubscription(sub, 'Subscription cancelled by user');
        continue;
      }

      // 2. Scheduled downgrade — switch to lower plan
      if (sub.scheduledDowngrade?.plan) {
        await processDowngrade(sub);
        continue;
      }

      // 3. Auto-renewal — attempt wallet charge
      await attemptRenewal(sub);
    } catch (error) {
      logger.error(`[Renewal] Error processing subscription ${sub._id}:`, error.message);
    }
  }
}

/**
 * Expire a subscription and downgrade user to free
 */
async function expireSubscription(sub, reason) {
  const planBefore = sub.plan;
  sub.status = SUBSCRIPTION_STATUS.EXPIRED;
  await sub.save();

  const user = await User.findByIdAndUpdate(sub.userId, {
    plan: PLAN_NAMES.FREE,
    subscriptionId: null,
  }, { new: true }).select('email firstName');

  await notifyUser(sub.userId, {
    type: 'subscription_expired',
    title: 'Subscription Expired',
    message: reason || `Your ${planBefore} subscription has expired. You're now on the Free plan.`,
    link: '/pricing',
  });

  // Send expiry email (non-blocking)
  if (user?.email) {
    sendSubscriptionEmail(user.email, {
      emailType: 'subscription-expired',
      name: user.firstName || 'User',
      plan: planBefore,
    }).catch(err => logger.error(`[Email] Expiry email failed for ${sub.userId}:`, err.message));
  }

  logger.info(`[Renewal] Subscription ${sub._id} expired for user ${sub.userId}`);
}

/**
 * Process a scheduled downgrade
 */
async function processDowngrade(sub) {
  const newPlan = sub.scheduledDowngrade.plan;
  const newPlanConfig = PLAN_LIMITS[newPlan];

  // If downgrading to free, just expire
  if (newPlan === PLAN_NAMES.FREE) {
    await expireSubscription(sub, `Your subscription has been downgraded to the Free plan.`);
    return;
  }

  const billingCycle = sub.billingCycle;
  const amount = newPlanConfig.price[billingCycle];
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  const session = await mongoose.startSession();
  try {
    let newSubId, transactionId;

    await session.withTransaction(async () => {
      // Check wallet
      const wallet = await Wallet.findOne({ userId: sub.userId }).session(session);
      if (!wallet || wallet.availableBalance < amount) {
        // Can't afford the downgraded plan — go to free
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Debit wallet
      await Wallet.atomicDebit(sub.userId, amount, session);

      // Expire old subscription
      sub.status = SUBSCRIPTION_STATUS.EXPIRED;
      sub.scheduledDowngrade = undefined;
      await sub.save({ session });

      // Create renewal transaction
      const idempotencyKey = generateIdempotencyKey('REN');
      const [transaction] = await Transaction.create(
        [
          {
            idempotencyKey,
            userId: sub.userId,
            type: TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
            direction: 'DEBIT',
            amount,
            netAmount: amount,
            currency: 'PKR',
            status: TRANSACTION_STATUS.SUCCESS,
            paymentMethod: 'WALLET',
            description: `Downgrade renewal: ${sub.plan} → ${newPlan} (${billingCycle})`,
            completedAt: new Date(),
          },
        ],
        { session }
      );

      // Create new subscription at lower tier
      const [newSub] = await Subscription.create(
        [
          {
            userId: sub.userId,
            plan: newPlan,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            billingCycle,
            amount,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paymentMethod: 'WALLET',
            transactionId: transaction._id,
            previousPlan: sub.plan,
            usage: { usageResetAt: now },
          },
        ],
        { session }
      );

      await User.findByIdAndUpdate(
        sub.userId,
        { plan: newPlan, subscriptionId: newSub._id },
        { session }
      );

      await PlatformWallet.addFee(amount, session);

      newSubId = newSub._id;
      transactionId = transaction._id;
    });

    // Generate invoice (outside transaction — non-critical)
    try {
      await invoiceService.createInvoice({
        userId: sub.userId,
        subscriptionId: newSubId,
        transactionId,
        type: 'renewal',
        plan: newPlan,
        billingCycle,
        amount,
        periodStart: now,
        periodEnd,
      });
    } catch (err) {
      logger.error(`[Invoice] Failed to create downgrade invoice for user ${sub.userId}:`, err.message);
    }

    await notifyUser(sub.userId, {
      type: 'subscription_downgraded',
      title: 'Plan Downgraded',
      message: `Your plan has been changed from ${sub.plan} to ${newPlan}.`,
      link: '/pricing',
    });

    logger.info(`[Renewal] Downgrade processed: ${sub.plan} → ${newPlan} for user ${sub.userId}`);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_BALANCE') {
      await expireSubscription(sub, `Insufficient balance for ${newPlan} plan renewal. You're now on the Free plan.`);
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }
}

/**
 * Attempt auto-renewal via wallet
 */
async function attemptRenewal(sub) {
  const planConfig = PLAN_LIMITS[sub.plan];
  if (!planConfig) {
    await expireSubscription(sub, 'Invalid plan configuration');
    return;
  }

  const amount = planConfig.price[sub.billingCycle];
  if (!amount || amount <= 0) {
    await expireSubscription(sub, 'Plan has no renewal cost');
    return;
  }

  const wallet = await Wallet.findOne({ userId: sub.userId });
  if (!wallet || wallet.availableBalance < amount) {
    // Insufficient funds — enter grace period
    sub.status = SUBSCRIPTION_STATUS.PAST_DUE;
    sub.gracePeriodEnd = new Date(Date.now() + GRACE_PERIOD_MS);
    sub.gracePeriodRemindersSent = 0;
    await sub.save();

    const user = await User.findById(sub.userId).select('email firstName').lean();

    await notifyUser(sub.userId, {
      type: 'subscription_renewal_failed',
      title: 'Renewal Failed',
      message: `Your ${sub.plan} subscription couldn't be renewed due to insufficient wallet balance (PKR ${amount} needed). You have 3 days to add funds before being downgraded to Free.`,
      link: '/wallet',
    });

    // Send renewal-failed email (non-blocking)
    if (user?.email) {
      sendSubscriptionEmail(user.email, {
        emailType: 'renewal-failed',
        name: user.firstName || 'User',
        plan: sub.plan,
        amount,
        gracePeriodEnd: sub.gracePeriodEnd,
      }).catch(err => logger.error(`[Email] Renewal-failed email error for ${sub.userId}:`, err.message));
    }

    logger.info(`[Renewal] Insufficient funds for user ${sub.userId}, grace period until ${sub.gracePeriodEnd}`);
    return;
  }

  // Sufficient balance — renew
  const now = new Date();
  const periodEnd = new Date(now);
  if (sub.billingCycle === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  const session = await mongoose.startSession();
  try {
    let newSubId, transactionId;

    await session.withTransaction(async () => {
      await Wallet.atomicDebit(sub.userId, amount, session);

      // Expire old
      sub.status = SUBSCRIPTION_STATUS.EXPIRED;
      await sub.save({ session });

      const idempotencyKey = generateIdempotencyKey('REN');
      const [transaction] = await Transaction.create(
        [
          {
            idempotencyKey,
            userId: sub.userId,
            type: TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
            direction: 'DEBIT',
            amount,
            netAmount: amount,
            currency: 'PKR',
            status: TRANSACTION_STATUS.SUCCESS,
            paymentMethod: 'WALLET',
            description: `Renewal: ${sub.plan} (${sub.billingCycle})`,
            completedAt: new Date(),
          },
        ],
        { session }
      );

      const [newSub] = await Subscription.create(
        [
          {
            userId: sub.userId,
            plan: sub.plan,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            billingCycle: sub.billingCycle,
            amount,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paymentMethod: 'WALLET',
            transactionId: transaction._id,
            previousPlan: sub.plan,
            usage: { usageResetAt: now },
          },
        ],
        { session }
      );

      await User.findByIdAndUpdate(
        sub.userId,
        { subscriptionId: newSub._id },
        { session }
      );

      await PlatformWallet.addFee(amount, session);

      newSubId = newSub._id;
      transactionId = transaction._id;
    });

    // Generate invoice (outside transaction — non-critical)
    try {
      await invoiceService.createInvoice({
        userId: sub.userId,
        subscriptionId: newSubId,
        transactionId,
        type: 'renewal',
        plan: sub.plan,
        billingCycle: sub.billingCycle,
        amount,
        periodStart: now,
        periodEnd,
      });
    } catch (err) {
      logger.error(`[Invoice] Failed to create renewal invoice for user ${sub.userId}:`, err.message);
    }

    await notifyUser(sub.userId, {
      type: 'subscription_renewed',
      title: 'Subscription Renewed',
      message: `Your ${sub.plan} subscription has been renewed successfully. PKR ${amount} was charged from your wallet.`,
      link: '/pricing',
    });

    // Send renewal-success email (non-blocking)
    const renewedUser = await User.findById(sub.userId).select('email firstName').lean();
    if (renewedUser?.email) {
      sendSubscriptionEmail(renewedUser.email, {
        emailType: 'renewal-success',
        name: renewedUser.firstName || 'User',
        plan: sub.plan,
        amount,
        billingCycle: sub.billingCycle,
        periodEnd,
      }).catch(err => logger.error(`[Email] Renewal email error for ${sub.userId}:`, err.message));
    }

    logger.info(`[Renewal] Subscription renewed for user ${sub.userId}, plan ${sub.plan}`);
  } finally {
    await session.endSession();
  }
}

/**
 * Process past_due subscriptions whose grace period has expired
 */
async function processGracePeriodExpired() {
  const now = new Date();

  const pastDueSubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    gracePeriodEnd: { $lte: now },
  }).limit(100);

  for (const sub of pastDueSubs) {
    try {
      // Final attempt to charge wallet
      const planConfig = PLAN_LIMITS[sub.plan];
      const amount = planConfig?.price[sub.billingCycle] || 0;
      const wallet = await Wallet.findOne({ userId: sub.userId });

      if (wallet && wallet.availableBalance >= amount && amount > 0) {
        // They topped up — attempt renewal
        sub.status = SUBSCRIPTION_STATUS.ACTIVE; // restore temporarily so attemptRenewal works
        sub.gracePeriodEnd = undefined;
        await sub.save();
        await attemptRenewal(sub);
      } else {
        // Still can't pay — expire
        await expireSubscription(sub, `Your ${sub.plan} subscription has expired due to insufficient balance after the grace period.`);
      }
    } catch (error) {
      logger.error(`[Renewal] Error processing grace period for ${sub._id}:`, error.message);
    }
  }
}

/**
 * Send renewal reminders for upcoming expirations
 */
async function sendRenewalReminders() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // 7-day reminders (only if not already sent in the last 5 days)
  const sevenDaySubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    cancelAtPeriodEnd: { $ne: true },
    currentPeriodEnd: { $lte: sevenDaysFromNow, $gt: threeDaysFromNow },
    $or: [
      { lastReminderSentAt: { $exists: false } },
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) } },
    ],
  }).limit(100);

  for (const sub of sevenDaySubs) {
    try {
      const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      await notifyUser(sub.userId, {
        type: 'subscription_expiring_soon',
        title: 'Subscription Renewing Soon',
        message: `Your ${sub.plan} subscription will renew in ${daysLeft} days. Ensure your wallet has sufficient funds (PKR ${sub.amount}).`,
        link: '/wallet',
      });
      sub.lastReminderSentAt = now;
      await sub.save();
    } catch (error) {
      logger.error(`[Renewal] Failed to send 7-day reminder for ${sub._id}:`, error.message);
    }
  }

  // 3-day reminders
  const threeDaySubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    cancelAtPeriodEnd: { $ne: true },
    currentPeriodEnd: { $lte: threeDaysFromNow, $gt: now },
    $or: [
      { lastReminderSentAt: { $exists: false } },
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) } },
    ],
  }).limit(100);

  for (const sub of threeDaySubs) {
    try {
      const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      await notifyUser(sub.userId, {
        type: 'subscription_expiring_soon',
        title: 'Subscription Renewing in ' + daysLeft + ' Days',
        message: `Your ${sub.plan} subscription renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Please ensure PKR ${sub.amount} is available in your wallet.`,
        link: '/wallet',
      });
      sub.lastReminderSentAt = now;
      await sub.save();
    } catch (error) {
      logger.error(`[Renewal] Failed to send 3-day reminder for ${sub._id}:`, error.message);
    }
  }
}

/**
 * Reset usage counters for active paid subscriptions whose period has elapsed.
 * Runs each hour. Resets when `usage.usageResetAt` is past `currentPeriodEnd`
 * and sets the next reset to the upcoming period boundary.
 */
async function resetExpiredUsage() {
  const now = new Date();

  const subs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    'usage.usageResetAt': { $lte: now },
    currentPeriodEnd: { $gt: now }, // still within an active period
  }).limit(200);

  for (const sub of subs) {
    try {
      // Only reset if usageResetAt is before the current period start
      // (this means we've entered a new billing period since last reset)
      if (sub.usage.usageResetAt < sub.currentPeriodStart) {
        sub.usage.proposalsUsed = 0;
        sub.usage.aiRequestsUsed = 0;
        sub.usage.jobsPosted = 0;
        sub.usage.usageResetAt = sub.currentPeriodStart;
        sub.lastUsageAlertSentAt = undefined;
        await sub.save();
        logger.info(`[Usage] Reset usage for subscription ${sub._id} (user ${sub.userId})`);
      }
    } catch (error) {
      logger.error(`[Usage] Failed to reset usage for ${sub._id}:`, error.message);
    }
  }
}

/**
 * Reset free-tier AI requests on a 7-day rolling window.
 * Finds free users whose `aiRequestsResetAt` has passed, zeroes
 * `aiRequestsUsed`, and sets the next reset 7 days out.
 */
async function resetFreeUserAI() {
  const now = new Date();

  const users = await User.find({
    plan: PLAN_NAMES.FREE,
    aiRequestsUsed: { $gt: 0 },
    $or: [
      { aiRequestsResetAt: { $lte: now } },
      { aiRequestsResetAt: { $exists: false } },
      { aiRequestsResetAt: null },
    ],
  })
    .select('_id aiRequestsUsed aiRequestsResetAt')
    .limit(500);

  for (const user of users) {
    try {
      const nextReset = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(user._id, {
        aiRequestsUsed: 0,
        aiRequestsResetAt: nextReset,
      });
      logger.info(`[Usage] Reset free AI usage for user ${user._id}`);
    } catch (error) {
      logger.error(`[Usage] Failed to reset free AI for user ${user._id}:`, error.message);
    }
  }
}

/**
 * Send usage-approaching alerts when a user hits 80% of any limit.
 * Sends both in-app notification and email. De-duplicated via `lastUsageAlertSentAt`.
 */
async function sendUsageAlerts() {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const activeSubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    plan: { $ne: PLAN_NAMES.FREE },
    $or: [
      { lastUsageAlertSentAt: { $exists: false } },
      { lastUsageAlertSentAt: null },
      { lastUsageAlertSentAt: { $lt: new Date(now.getTime() - ONE_DAY_MS) } },
    ],
  })
    .populate('userId', 'email firstName lastName')
    .limit(200);

  for (const sub of activeSubs) {
    try {
      const planConfig = PLAN_LIMITS[sub.plan];
      if (!planConfig) continue;

      const user = sub.userId;
      if (!user?.email) continue;
      const name = user.firstName || 'User';

      const checks = [
        { field: 'proposalsUsed', limit: planConfig.proposals, label: 'proposals' },
        { field: 'aiRequestsUsed', limit: planConfig.aiRequests, label: 'AI requests' },
        { field: 'jobsPosted', limit: planConfig.jobPosts, label: 'job posts' },
      ];

      let alertSent = false;
      for (const { field, limit, label } of checks) {
        if (limit === -1) continue; // unlimited
        const used = sub.usage[field] || 0;
        const percentage = Math.round((used / limit) * 100);

        if (percentage >= 80) {
          // In-app notification
          await notifyUser(user._id, {
            type: 'usage_alert',
            title: `${label} Usage at ${percentage}%`,
            message: `You've used ${used} of ${limit} ${label} on your ${sub.plan} plan this period.`,
            link: '/pricing',
          });

          // Email notification
          try {
            await sendSubscriptionEmail(user.email, {
              emailType: 'usage-alert',
              name,
              plan: sub.plan,
              resourceType: label,
              used,
              limit,
              percentage,
            });
          } catch (err) {
            logger.error(`[Usage] Failed to send usage alert email for ${user._id}:`, err.message);
          }

          alertSent = true;
        }
      }

      if (alertSent) {
        sub.lastUsageAlertSentAt = now;
        await sub.save();
      }
    } catch (error) {
      logger.error(`[Usage] Failed to check usage alerts for ${sub._id}:`, error.message);
    }
  }
}

/**
 * Send escalating reminders during the grace period (day 1, 2, 3).
 * Each reminder is tracked via `gracePeriodRemindersSent` counter.
 */
async function sendGracePeriodReminders() {
  const now = new Date();

  const pastDueSubs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    gracePeriodEnd: { $gt: now },
  })
    .populate('userId', 'email firstName lastName')
    .limit(100);

  for (const sub of pastDueSubs) {
    try {
      const user = sub.userId;
      if (!user?.email) continue;
      const name = user.firstName || 'User';

      const totalGraceMs = sub.gracePeriodEnd.getTime() - (sub.gracePeriodEnd.getTime() - GRACE_PERIOD_MS);
      const elapsedMs = now.getTime() - (sub.gracePeriodEnd.getTime() - GRACE_PERIOD_MS);
      const daysPassed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
      const daysLeft = Math.max(1, Math.ceil((sub.gracePeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      const remindersSent = sub.gracePeriodRemindersSent || 0;

      // Send reminder if we've passed another day and haven't sent one for this day
      if (daysPassed > remindersSent && remindersSent < 3) {
        const planConfig = PLAN_LIMITS[sub.plan];
        const amount = planConfig?.price[sub.billingCycle] || 0;

        // In-app notification
        await notifyUser(user._id, {
          type: 'grace_period_warning',
          title: `${daysLeft} Day${daysLeft !== 1 ? 's' : ''} Left — Add Funds`,
          message: `Your ${sub.plan} subscription will expire in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Add PKR ${amount} to your wallet now.`,
          link: '/wallet',
        });

        // Email notification
        try {
          await sendSubscriptionEmail(user.email, {
            emailType: 'grace-period-warning',
            name,
            plan: sub.plan,
            daysLeft,
            amount,
          });
        } catch (err) {
          logger.error(`[Dunning] Failed to send grace period email for ${user._id}:`, err.message);
        }

        sub.gracePeriodRemindersSent = remindersSent + 1;
        await sub.save();
        logger.info(`[Dunning] Sent grace period reminder #${remindersSent + 1} for user ${user._id} (${daysLeft} days left)`);
      }
    } catch (error) {
      logger.error(`[Dunning] Error processing grace period reminder for ${sub._id}:`, error.message);
    }
  }
}

/**
 * Snapshot daily subscription metrics for MRR, churn, and plan distribution analytics.
 * Runs once daily at midnight.
 */
async function snapshotSubscriptionMetrics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    // Plan distribution (all users)
    const planCounts = await User.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
    ]);
    const planDistribution = { free: 0, lite: 0, pro: 0, business: 0 };
    for (const { _id, count } of planCounts) {
      planDistribution[_id || 'free'] = count;
    }

    // Active paid subscriptions
    const activeSubscriptions = await Subscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      plan: { $ne: PLAN_NAMES.FREE },
    });

    // MRR: sum monthly equivalent of all active paid subscriptions
    const mrrAgg = await Subscription.aggregate([
      { $match: { status: SUBSCRIPTION_STATUS.ACTIVE, plan: { $ne: PLAN_NAMES.FREE } } },
      {
        $project: {
          monthlyAmount: {
            $cond: [{ $eq: ['$billingCycle', 'yearly'] }, { $divide: ['$amount', 12] }, '$amount'],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$monthlyAmount' } } },
    ]);
    const mrr = Math.round(mrrAgg[0]?.total || 0);

    // New subscriptions today
    const newSubscriptions = await Subscription.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd },
      plan: { $ne: PLAN_NAMES.FREE },
    });

    // Churned today (expired/cancelled)
    const churned = await Subscription.countDocuments({
      status: { $in: [SUBSCRIPTION_STATUS.EXPIRED, SUBSCRIPTION_STATUS.CANCELLED] },
      updatedAt: { $gte: todayStart, $lt: todayEnd },
    });

    // Transactions today  
    const txnAgg = await Transaction.aggregate([
      {
        $match: {
          type: { $in: [TRANSACTION_TYPE.SUBSCRIPTION, TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL] },
          status: TRANSACTION_STATUS.SUCCESS,
          completedAt: { $gte: todayStart, $lt: todayEnd },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          total: { $sum: '$amount' },
        },
      },
    ]);

    let dailyRevenue = 0;
    let renewals = 0;
    for (const t of txnAgg) {
      dailyRevenue += t.total;
      if (t._id === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL) renewals = t.count;
    }

    // Failed renewals (entered grace period today)
    const failedRenewals = await Subscription.countDocuments({
      status: SUBSCRIPTION_STATUS.PAST_DUE,
      updatedAt: { $gte: todayStart, $lt: todayEnd },
    });

    // Upgrades & downgrades today
    const upgrades = await Subscription.countDocuments({
      upgradedAt: { $gte: todayStart, $lt: todayEnd },
    });
    const downgrades = await Subscription.countDocuments({
      'scheduledDowngrade.scheduledAt': { $gte: todayStart, $lt: todayEnd },
    });

    // Upsert today's metrics (idempotent — safe to re-run)
    await SubscriptionMetrics.findOneAndUpdate(
      { date: todayStart },
      {
        date: todayStart,
        planDistribution,
        activeSubscriptions,
        mrr,
        newSubscriptions,
        churned,
        renewals,
        failedRenewals,
        dailyRevenue,
        upgrades,
        downgrades,
      },
      { upsert: true, new: true }
    );

    logger.info(`[Analytics] Subscription metrics snapshot saved — MRR: PKR ${mrr}, Active: ${activeSubscriptions}, Churned: ${churned}`);
  } catch (error) {
    logger.error('[Analytics] Failed to snapshot subscription metrics:', error.message);
  }
}

/**
 * Initialize the subscription renewal cron job
 * Runs every hour at minute 0
 */
export function initSubscriptionRenewalCron() {
  // ── Hourly cron: renewals, usage resets, alerts, reminders ──
  cron.schedule('0 * * * *', async () => {
    logger.info('[Renewal] Running subscription renewal check');
    try {
      await processExpiredSubscriptions();
      await processGracePeriodExpired();
      await sendRenewalReminders();
      await resetExpiredUsage();
      await resetFreeUserAI();
      await sendUsageAlerts();
      await sendGracePeriodReminders();
      logger.info('[Renewal] Subscription renewal check completed');
    } catch (error) {
      logger.error('[Renewal] Subscription renewal cron error:', error.message);
    }
  });

  // ── Daily cron at midnight: analytics snapshot ──
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Analytics] Running daily subscription metrics snapshot');
    try {
      await snapshotSubscriptionMetrics();
    } catch (error) {
      logger.error('[Analytics] Daily snapshot cron error:', error.message);
    }
  });

  logger.info('[Renewal] Subscription renewal cron initialized (runs every hour)');
  logger.info('[Analytics] Subscription metrics cron initialized (runs daily at midnight)');
}

export default { initSubscriptionRenewalCron };
