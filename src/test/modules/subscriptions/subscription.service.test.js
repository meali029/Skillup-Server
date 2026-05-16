import mongoose from 'mongoose';
import subscriptionService from '../../../modules/subscriptions/subscription.service.js';
import Subscription from '../../../models/Subscription.js';
import User from '../../../models/User.js';
import Transaction from '../../../models/Transaction.js';

jest.mock('../../../models/Subscription.js', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    getActiveSubscription: jest.fn(),
  },
}));

jest.mock('../../../models/User.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../../../models/Transaction.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../../../models/Wallet.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../../models/PlatformWallet.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../../services/paymentGateways/safepay.service.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../../services/invoice.service.js', () => ({
  __esModule: true,
  default: {},
}));

describe('SubscriptionService hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getPlans normalizes catalog role and feature aliases', () => {
    const plans = subscriptionService.getPlans('admin');
    const proPlan = plans.find((plan) => plan.id === 'pro');

    expect(plans.every((plan) => plan.catalogRole === 'freelancer')).toBe(true);
    expect(typeof proPlan.commission).toBe('number');
    expect(proPlan.features).toEqual(
      expect.objectContaining({
        aiProposalOptimize: true,
        aiCoverLetter: expect.any(Boolean),
        aiInterviewPrep: expect.any(Boolean),
        featuredProfile: expect.any(Boolean),
      })
    );
  });

  test('purchaseSubscription blocks non-subscriber roles', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ role: 'admin' }),
    });

    await expect(
      subscriptionService.purchaseSubscription('user-1', 'pro', 'monthly', 'WALLET')
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(Subscription.getActiveSubscription).not.toHaveBeenCalled();
  });

  test('activateAfterPayment is idempotent when subscription already exists', async () => {
    const transaction = {
      _id: 'txn-1',
      type: 'SUBSCRIPTION',
      status: 'SUCCESS',
    };
    const existingSubscription = { _id: 'sub-1', transactionId: 'txn-1' };

    Transaction.findById.mockResolvedValue(transaction);
    Subscription.findOne.mockResolvedValue(existingSubscription);

    const startSessionSpy = jest.spyOn(mongoose, 'startSession');

    const result = await subscriptionService.activateAfterPayment('txn-1');

    expect(result).toEqual({ subscription: existingSubscription, transaction });
    expect(startSessionSpy).not.toHaveBeenCalled();
  });
});
