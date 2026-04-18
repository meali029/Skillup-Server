import { asyncHandler } from '../../core/utils/index.js';
import subscriptionService from './subscription.service.js';
import invoiceService from '../../services/invoice.service.js';

/**
 * GET /api/subscriptions/plans
 * Public — list all plans with pricing
 */
export const getPlans = asyncHandler(async (req, res) => {
  const plans = subscriptionService.getPlans();
  res.json({ success: true, data: plans });
});

/**
 * GET /api/subscriptions/current
 * Auth — current plan + subscription details
 */
export const getCurrentSubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getCurrentSubscription(req.user.id);
  res.json({ success: true, data });
});

/**
 * POST /api/subscriptions/purchase
 * Auth — buy a plan (wallet or Safepay)
 */
export const purchaseSubscription = asyncHandler(async (req, res) => {
  const { plan, billingCycle, paymentMethod } = req.body;
  const result = await subscriptionService.purchaseSubscription(
    req.user.id,
    plan,
    billingCycle,
    paymentMethod
  );
  res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/subscriptions/cancel
 * Auth — cancel at period end
 */
export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(
    req.user.id,
    req.body.reason
  );
  res.json({ success: true, data: subscription });
});

/**
 * POST /api/subscriptions/reactivate
 * Auth — undo cancellation
 */
export const reactivateSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.reactivateSubscription(
    req.user.id
  );
  res.json({ success: true, data: subscription });
});

/**
 * GET /api/subscriptions/usage
 * Auth — detailed usage breakdown
 */
export const getUsage = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getUsage(req.user.id);
  res.json({ success: true, data });
});

/**
 * POST /api/subscriptions/upgrade
 * Auth — upgrade to a higher plan (with proration)
 */
export const upgradeSubscription = asyncHandler(async (req, res) => {
  const { plan, billingCycle, paymentMethod } = req.body;
  const result = await subscriptionService.upgradeSubscription(
    req.user.id,
    plan,
    billingCycle,
    paymentMethod
  );
  res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/subscriptions/upgrade/preview
 * Auth — get proration preview without side effects
 */
export const upgradePreview = asyncHandler(async (req, res) => {
  const { plan, billingCycle } = req.body;
  const data = await subscriptionService.getUpgradePreview(
    req.user.id,
    plan,
    billingCycle
  );
  res.json({ success: true, data });
});

/**
 * POST /api/subscriptions/downgrade
 * Auth — schedule downgrade at period end
 */
export const downgradeSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.scheduleDowngrade(
    req.user.id,
    req.body.plan
  );
  res.json({ success: true, data: subscription });
});

/**
 * POST /api/subscriptions/downgrade/cancel
 * Auth — cancel a scheduled downgrade
 */
export const cancelDowngrade = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelScheduledDowngrade(
    req.user.id
  );
  res.json({ success: true, data: subscription });
});

/**
 * GET /api/subscriptions/invoices
 * Auth — list user's invoices
 */
export const getInvoices = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const data = await invoiceService.getUserInvoices(req.user.id, { page, limit });
  res.json({ success: true, data });
});

/**
 * GET /api/subscriptions/invoices/:id/download
 * Auth — download invoice PDF
 */
export const downloadInvoice = asyncHandler(async (req, res) => {
  const pdfBuffer = await invoiceService.generatePDF(req.params.id, req.user.id);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="invoice-${req.params.id}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

/**
 * POST /api/admin/subscriptions/grant
 * Admin — grant plan to user
 */
export const adminGrantPlan = asyncHandler(async (req, res) => {
  const { userId, plan, durationDays } = req.body;
  const subscription = await subscriptionService.adminGrantPlan(
    userId,
    plan,
    req.user.id,
    durationDays
  );
  res.status(201).json({ success: true, data: subscription });
});

/**
 * GET /api/admin/subscriptions/stats
 * Admin — subscription analytics
 */
export const getStats = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getStats();
  res.json({ success: true, data });
});

/**
 * GET /api/admin/subscriptions/metrics?days=30
 * Admin — subscription metrics time series (MRR, churn, etc.)
 */
export const getMetrics = asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
  const data = await subscriptionService.getMetrics(days);
  res.json({ success: true, data });
});
