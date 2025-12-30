import DisputeService from '../../../modules/disputes/dispute.service.js';
import Dispute from '../../../models/Dispute.js';
import Contract from '../../../models/Contract.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';

jest.mock('../../../models/Dispute.js');
jest.mock('../../../models/Contract.js');
jest.mock('../../../core/utils/auditLogger.js');

describe('Dispute Service', () => {
  beforeEach(() => jest.restoreAllMocks());

  // helper to simulate chainable mongoose query objects that resolve to `value`
  const makeChain = (value) => {
    const q = {};
    q.populate = jest.fn(() => q);
    q.sort = jest.fn(() => q);
    q.limit = jest.fn(() => q);
    q.lean = jest.fn().mockResolvedValue(value);
    q.then = (resolve) => resolve(value);
    return q;
  };

  describe('createDispute', () => {
    test('throws when contract not found', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(DisputeService.createDispute({ contractId: 'c1' }, 'u1')).rejects.toThrow('Contract not found');
    });

    test('throws when user not authorized', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue({ client: 'x', freelancer: 'y' });
      await expect(DisputeService.createDispute({ contractId: 'c1' }, 'u1')).rejects.toThrow('You are not authorized');
    });

    test('creates dispute, updates contract and logs audit', async () => {
      const contract = { client: { toString: () => 'u1' }, status: 'active', save: jest.fn() };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);

      const created = { disputeId: 'd1', contractId: 'c1' };
      jest.spyOn(Dispute, 'create').mockResolvedValue(created);

      const auditSpy = jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

      const out = await DisputeService.createDispute({ contractId: 'c1', reason: 'r', description: 'd' }, 'u1');
      expect(out).toBe(created);
      expect(contract.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalled();
    });
  });

  describe('getAllDisputes', () => {
    test('returns result from Dispute.getDisputes', async () => {
      const res = { disputes: [], pagination: {} };
      jest.spyOn(Dispute, 'getDisputes').mockResolvedValue(res);
      const out = await DisputeService.getAllDisputes();
      expect(out).toBe(res);
    });
  });

  describe('getDisputeById', () => {
    test('throws when not found', async () => {
      jest.spyOn(Dispute, 'findOne').mockImplementation(() => makeChain(null));
      await expect(DisputeService.getDisputeById('d1')).rejects.toThrow('Dispute not found');
    });

    test('returns populated dispute', async () => {
      const d = { _id: 'd1' };
      jest.spyOn(Dispute, 'findOne').mockImplementation(() => makeChain(d));
      const out = await DisputeService.getDisputeById('d1');
      expect(out).toBe(d);
    });
  });

  describe('getDisputesByContract', () => {
    test('returns disputes list', async () => {
      const list = [{ _id: 'd1' }];
      jest.spyOn(Dispute, 'find').mockImplementation(() => makeChain(list));
      const out = await DisputeService.getDisputesByContract('c1');
      expect(out).toEqual(list);
    });
  });

  describe('resolveDispute', () => {
    test('throws when not found', async () => {
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(null);
      await expect(DisputeService.resolveDispute('d1', 'res', 'a1')).rejects.toThrow('Dispute not found');
    });

    test('throws when not open', async () => {
      const dispute = { status: 'RESOLVED' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      await expect(DisputeService.resolveDispute('d1', 'res', 'a1')).rejects.toThrow('Only open disputes can be resolved');
    });

    test('resolves dispute and updates contract when no other open disputes', async () => {
      const dispute = { status: 'OPEN', resolve: jest.fn().mockResolvedValue(true), contractId: 'c1', disputeId: 'd1' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(Dispute, 'countDocuments').mockResolvedValue(0);
      const contract = { status: 'disputed', save: jest.fn() };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      const auditSpy = jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

      const out = await DisputeService.resolveDispute('d1', 'res', 'a1');
      expect(dispute.resolve).toHaveBeenCalled();
      expect(contract.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalled();
      expect(out).toBe(dispute);
    });
  });

  describe('rejectDispute', () => {
    test('throws when not found', async () => {
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(null);
      await expect(DisputeService.rejectDispute('d1', 'r', 'a1')).rejects.toThrow('Dispute not found');
    });

    test('throws when not open', async () => {
      const dispute = { status: 'RESOLVED' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      await expect(DisputeService.rejectDispute('d1', 'r', 'a1')).rejects.toThrow('Only open disputes can be rejected');
    });

    test('rejects dispute and updates contract when no other open disputes', async () => {
      const dispute = { status: 'OPEN', reject: jest.fn().mockResolvedValue(true), contractId: 'c1', disputeId: 'd1' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      jest.spyOn(Dispute, 'countDocuments').mockResolvedValue(0);
      const contract = { status: 'disputed', save: jest.fn() };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      const auditSpy = jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

      const out = await DisputeService.rejectDispute('d1', 'r', 'a1');
      expect(dispute.reject).toHaveBeenCalled();
      expect(contract.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalled();
      expect(out).toBe(dispute);
    });
  });

  describe('addAdminNote', () => {
    test('throws when not found', async () => {
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(null);
      await expect(DisputeService.addAdminNote('d1', 'n', 'a1')).rejects.toThrow('Dispute not found');
    });

    test('adds note and logs audit', async () => {
      const dispute = { addAdminNote: jest.fn().mockResolvedValue(true), disputeId: 'd1' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      const auditSpy = jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

      const out = await DisputeService.addAdminNote('d1', 'n', 'a1');
      expect(dispute.addAdminNote).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalled();
      expect(out).toBe(dispute);
    });
  });

  describe('getDisputeStats', () => {
    test('returns aggregated stats', async () => {
      jest.spyOn(Dispute, 'countDocuments').mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      jest.spyOn(Dispute, 'find').mockImplementation(() => makeChain([{ _id: 'd1' }]));

      const out = await DisputeService.getDisputeStats();
      expect(out.total).toBe(5);
      expect(out.recentDisputes.length).toBe(1);
    });
  });

  describe('updateDisputeStatus', () => {
    test('throws when not found', async () => {
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(null);
      await expect(DisputeService.updateDisputeStatus('d1', 'RESOLVED', 'a1')).rejects.toThrow('Dispute not found');
    });

    test('updates status and logs audit', async () => {
      const dispute = { status: 'OPEN', save: jest.fn().mockResolvedValue(true), disputeId: 'd1' };
      jest.spyOn(Dispute, 'findOne').mockResolvedValue(dispute);
      const auditSpy = jest.spyOn(require('../../../core/utils/auditLogger.js'), 'createAuditLog').mockResolvedValue(true);

      const out = await DisputeService.updateDisputeStatus('d1', 'RESOLVED', 'a1', 'notes');
      expect(dispute.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalled();
      expect(out).toBe(dispute);
    });
  });
});