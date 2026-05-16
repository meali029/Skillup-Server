import * as paymentController from '../../modules/payments/payment.controller.js';
import Transaction from '../../models/Transaction.js';
import safepayService from '../../services/paymentGateways/safepay.service.js';
import { notifyUser } from '../../modules/notifications/notification.service.js';

jest.mock('../../modules/payments/payment.service.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../modules/payments/wallet.service.js', () => ({
  __esModule: true,
  default: {
    creditWallet: jest.fn(),
  },
}));

jest.mock('../../modules/payments/withdrawal.service.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../modules/payments/escrow.service.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../services/paymentGateways/paymentMode.service.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../modules/subscriptions/subscription.service.js', () => ({
  __esModule: true,
  default: {
    activateAfterPayment: jest.fn(),
  },
}));

jest.mock('../../models/Transaction.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../models/Escrow.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../../models/Contract.js', () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../../services/paymentGateways/safepay.service.js', () => ({
  __esModule: true,
  default: {
    verifyPaymentByTracker: jest.fn(),
    getCredentials: jest.fn(() => ({ webhookSecret: '', sandbox: true })),
    verifyWebhookSignature: jest.fn(() => true),
  },
}));

jest.mock('../../modules/notifications/notification.service.js', () => ({
  __esModule: true,
  notifyUser: jest.fn(),
}));

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('PaymentController subscription hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('verifySafepayPending fails stale pending transactions and notifies user', async () => {
    process.env.SAFEPAY_PENDING_TIMEOUT_HOURS = '24';

    const staleTxn = {
      _id: 'txn-stale-1',
      userId: 'user-1',
      createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      paymentMethod: 'SAFEPAY',
      status: 'PENDING',
      type: 'SUBSCRIPTION',
      gatewayTransactionId: 'tracker-1',
      description: 'Subscription checkout',
    };

    Transaction.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([staleTxn]),
    });
    Transaction.findOneAndUpdate.mockResolvedValue({
      ...staleTxn,
      status: 'FAILED',
      failureReason: 'timeout',
    });

    const req = { user: { id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    await paymentController.verifySafepayPending(req, res, next);

    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'txn-stale-1', status: 'PENDING' },
      expect.objectContaining({ status: 'FAILED' }),
      { new: true }
    );
    expect(notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        type: 'payment_failed',
        link: '/pricing',
      })
    );
    expect(safepayService.verifyPaymentByTracker).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          verified: 0,
          timedOut: 1,
          pending: 0,
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('cancelSafepayPending cancels latest deposit or subscription transaction', async () => {
    Transaction.findOneAndUpdate.mockResolvedValue({ _id: 'txn-cancelled-1' });

    const req = { user: { id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    await paymentController.cancelSafepayPending(req, res, next);

    const [queryArg] = Transaction.findOneAndUpdate.mock.calls[0];
    expect(queryArg.type.$in).toEqual(expect.arrayContaining(['DEPOSIT', 'SUBSCRIPTION']));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ cancelled: 1 }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
