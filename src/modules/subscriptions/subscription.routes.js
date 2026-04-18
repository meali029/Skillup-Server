import { Router } from 'express';
import { authenticate } from '../../core/middlewares/index.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as ctrl from './subscription.controller.js';
import * as schemas from './subscription.validation.js';

const router = Router();

// Public
router.get('/plans', ctrl.getPlans);

// Authenticated user routes
router.get('/current', authenticate, ctrl.getCurrentSubscription);
router.post('/purchase', authenticate, validate(schemas.purchaseSubscription), ctrl.purchaseSubscription);
router.post('/upgrade', authenticate, validate(schemas.upgradeSubscription), ctrl.upgradeSubscription);
router.post('/upgrade/preview', authenticate, validate(schemas.upgradePreview), ctrl.upgradePreview);
router.post('/downgrade', authenticate, validate(schemas.downgradeSubscription), ctrl.downgradeSubscription);
router.post('/downgrade/cancel', authenticate, ctrl.cancelDowngrade);
router.post('/cancel', authenticate, validate(schemas.cancelSubscription), ctrl.cancelSubscription);
router.post('/reactivate', authenticate, ctrl.reactivateSubscription);
router.get('/usage', authenticate, ctrl.getUsage);
router.get('/invoices', authenticate, ctrl.getInvoices);
router.get('/invoices/:id/download', authenticate, ctrl.downloadInvoice);

export default router;

// Admin routes (mounted separately in app.js behind admin auth)
export const adminRouter = Router();
adminRouter.post('/grant', validate(schemas.adminGrantPlan), ctrl.adminGrantPlan);
adminRouter.get('/stats', ctrl.getStats);
adminRouter.get('/metrics', ctrl.getMetrics);
