/**
 * Payment Service Tests
 */

import paymentService from '../../../modules/payments/payment.service.js';
import Transaction from '../../../models/Transaction.js';
import walletService from '../../../modules/payments/wallet.service.js';
import jazzCashService from '../../../services/paymentGateways/jazzCash.service.js';
import { TRANSACTION_TYPE, TRANSACTION_STATUS, PAYMENT_METHOD } from '../../../modules/payments/payment.constants.js';

jest.mock('../../../modules/payments/wallet.service.js');
jest.mock('../../../services/paymentGateways/jazzCash.service.js');

describe('PaymentService', () => {
  let userId;

  beforeEach(() => {
    userId = '507f1f77bcf86cd799439011';
    Transaction.create = jest.fn().mockResolvedValue({
      _id: 'txn123',
      save: jest.fn().mockResolvedValue({}),
    });
  });

  describe('initializeDeposit', () => {
    it('should initialize deposit payment', async () => {
      const amount = 1000;
      const paymentMethod = PAYMENT_METHOD.JAZZCASH;
      const customerData = { email: 'test@example.com' };

      jazzCashService.initializePayment = jest.fn().mockResolvedValue({
        success: true,
        paymentUrl: 'https://payment.url',
        transactionRef: 'ref123',
      });

      const result = await paymentService.initializeDeposit(
        userId,
        amount,
        paymentMethod,
        customerData
      );

      expect(jazzCashService.initializePayment).toHaveBeenCalled();
      expect(Transaction.create).toHaveBeenCalled();
      expect(result.transactionId).toBeDefined();
      expect(result.paymentUrl).toBeDefined();
    });

    it('should throw error for invalid amount', async () => {
      await expect(
        paymentService.initializeDeposit(userId, 50, PAYMENT_METHOD.JAZZCASH)
      ).rejects.toThrow();
    });
  });

  describe('verifyDeposit', () => {
    it('should verify successful deposit', async () => {
      const transactionId = 'txn123';
      const callbackData = { pp_ResponseCode: '000' };
      const paymentMethod = PAYMENT_METHOD.JAZZCASH;

      const mockTransaction = {
        _id: transactionId,
        userId,
        status: TRANSACTION_STATUS.PENDING,
        markSuccess: jest.fn().mockResolvedValue({}),
        save: jest.fn().mockResolvedValue({}),
      };

      Transaction.findById = jest.fn().mockResolvedValue(mockTransaction);
      jazzCashService.verifyPayment = jest.fn().mockResolvedValue({
        success: true,
        amount: 1000,
        gatewayTransactionId: 'gw123',
      });
      walletService.creditWallet = jest.fn().mockResolvedValue({});

      const result = await paymentService.verifyDeposit(
        transactionId,
        callbackData,
        paymentMethod
      );

      expect(walletService.creditWallet).toHaveBeenCalled();
      expect(mockTransaction.markSuccess).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});

