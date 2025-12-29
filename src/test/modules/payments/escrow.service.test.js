/**
 * Escrow Service Tests
 */

import escrowService from '../../../modules/payments/escrow.service.js';
import Escrow from '../../../models/Escrow.js';
import Contract from '../../../models/Contract.js';
import walletService from '../../../modules/payments/wallet.service.js';
import { ESCROW_STATUS } from '../../../modules/payments/payment.constants.js';

jest.mock('../../../modules/payments/wallet.service.js');

describe('EscrowService', () => {
  let contractId, milestoneId, clientId, freelancerId;
  let mockContract, mockEscrow;

  beforeEach(() => {
    contractId = '507f1f77bcf86cd799439011';
    milestoneId = 'milestone123';
    clientId = '507f1f77bcf86cd799439012';
    freelancerId = '507f1f77bcf86cd799439013';

    mockContract = {
      _id: contractId,
      client: clientId,
      freelancer: freelancerId,
      milestones: [
        {
          _id: milestoneId,
          amount: 1000,
          status: 'pending',
        },
      ],
      save: jest.fn().mockResolvedValue(mockContract),
    };

    mockEscrow = {
      _id: 'escrow123',
      contractId,
      milestoneId,
      clientId,
      freelancerId,
      amount: 1000,
      status: ESCROW_STATUS.CREATED,
      fund: jest.fn().mockResolvedValue(mockEscrow),
      lock: jest.fn().mockResolvedValue(mockEscrow),
      release: jest.fn().mockResolvedValue(mockEscrow),
      refund: jest.fn().mockResolvedValue(mockEscrow),
      freeze: jest.fn().mockResolvedValue(mockEscrow),
      save: jest.fn().mockResolvedValue(mockEscrow),
    };

    Contract.findById = jest.fn().mockResolvedValue(mockContract);
    Escrow.findById = jest.fn().mockResolvedValue(mockEscrow);
    Escrow.create = jest.fn().mockResolvedValue(mockEscrow);
    Escrow.getByMilestone = jest.fn().mockResolvedValue(null);
    Escrow.getByContract = jest.fn().mockResolvedValue([mockEscrow]);
  });

  describe('createEscrow', () => {
    it('should create escrow for milestone', async () => {
      const amount = 1000;

      const escrow = await escrowService.createEscrow(contractId, milestoneId, amount);

      expect(Escrow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contractId,
          milestoneId,
          clientId,
          freelancerId,
          amount,
          status: ESCROW_STATUS.CREATED,
        })
      );
      expect(escrow).toEqual(mockEscrow);
    });

    it('should throw error if contract not found', async () => {
      Contract.findById.mockResolvedValue(null);
      await expect(
        escrowService.createEscrow(contractId, milestoneId, 1000)
      ).rejects.toThrow('Contract not found');
    });
  });

  describe('fundEscrow', () => {
    it('should fund escrow and lock funds', async () => {
      const paymentData = {
        transactionId: 'txn123',
        paymentMethod: 'JAZZCASH',
        gatewayTransactionId: 'gw123',
      };

      walletService.transferToEscrow = jest.fn().mockResolvedValue({});

      const escrow = await escrowService.fundEscrow(mockEscrow._id, paymentData);

      expect(walletService.transferToEscrow).toHaveBeenCalledWith(
        clientId,
        mockEscrow.amount,
        mockEscrow._id
      );
      expect(mockEscrow.fund).toHaveBeenCalled();
      expect(mockEscrow.lock).toHaveBeenCalled();
    });
  });

  describe('releaseEscrow', () => {
    it('should release escrow to freelancer', async () => {
      mockEscrow.status = ESCROW_STATUS.LOCKED;
      mockContract.milestones[0].status = 'completed';

      walletService.releaseFromEscrow = jest.fn().mockResolvedValue({});

      const escrow = await escrowService.releaseEscrow(mockEscrow._id, clientId);

      expect(walletService.releaseFromEscrow).toHaveBeenCalledWith(
        mockEscrow._id,
        freelancerId,
        mockEscrow.amount
      );
      expect(mockEscrow.release).toHaveBeenCalled();
    });
  });
});

