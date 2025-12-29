/**
 * Wallet Service Tests
 */

import walletService from '../../../modules/payments/wallet.service.js';
import Wallet from '../../../models/Wallet.js';
import Transaction from '../../../models/Transaction.js';
import { TRANSACTION_TYPE, TRANSACTION_STATUS } from '../../../modules/payments/payment.constants.js';

describe('WalletService', () => {
  let userId;
  let mockWallet;

  beforeEach(() => {
    userId = '507f1f77bcf86cd799439011';
    mockWallet = {
      _id: '507f1f77bcf86cd799439012',
      userId,
      availableBalance: 1000,
      lockedBalance: 500,
      totalEarned: 2000,
      totalWithdrawn: 500,
      currency: 'PKR',
      save: jest.fn().mockResolvedValue(mockWallet),
    };

    Wallet.getOrCreateWallet = jest.fn().mockResolvedValue(mockWallet);
    Transaction.create = jest.fn().mockResolvedValue({});
  });

  describe('getWallet', () => {
    it('should get or create wallet for user', async () => {
      const wallet = await walletService.getWallet(userId);
      expect(Wallet.getOrCreateWallet).toHaveBeenCalledWith(userId);
      expect(wallet).toEqual(mockWallet);
    });
  });

  describe('creditWallet', () => {
    it('should credit wallet with amount', async () => {
      const amount = 100;
      const transactionId = 'txn123';

      await walletService.creditWallet(userId, amount, transactionId);

      expect(mockWallet.availableBalance).toBe(1100);
      expect(mockWallet.totalEarned).toBe(2100);
      expect(mockWallet.save).toHaveBeenCalled();
      expect(Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: TRANSACTION_TYPE.DEPOSIT,
          amount,
          status: TRANSACTION_STATUS.SUCCESS,
        })
      );
    });

    it('should throw error for invalid amount', async () => {
      await expect(
        walletService.creditWallet(userId, -10, 'txn123')
      ).rejects.toThrow('Amount must be greater than zero');
    });
  });

  describe('debitWallet', () => {
    it('should debit wallet with amount', async () => {
      const amount = 100;
      const transactionId = 'txn123';

      await walletService.debitWallet(userId, amount, transactionId);

      expect(mockWallet.availableBalance).toBe(900);
      expect(mockWallet.save).toHaveBeenCalled();
    });

    it('should throw error for insufficient balance', async () => {
      mockWallet.availableBalance = 50;
      await expect(
        walletService.debitWallet(userId, 100, 'txn123')
      ).rejects.toThrow('Insufficient available balance');
    });
  });

  describe('lockFunds', () => {
    it('should lock funds for escrow', async () => {
      const amount = 200;

      await walletService.lockFunds(userId, amount);

      expect(mockWallet.availableBalance).toBe(800);
      expect(mockWallet.lockedBalance).toBe(700);
      expect(mockWallet.save).toHaveBeenCalled();
    });
  });

  describe('unlockFunds', () => {
    it('should unlock funds from escrow', async () => {
      const amount = 200;

      await walletService.unlockFunds(userId, amount);

      expect(mockWallet.lockedBalance).toBe(300);
      expect(mockWallet.availableBalance).toBe(1200);
      expect(mockWallet.save).toHaveBeenCalled();
    });
  });
});

