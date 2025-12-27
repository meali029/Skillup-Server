import ContractService from '../../../modules/contracts/contract.service.js';
import Contract from '../../../models/Contract.js';
import Proposal from '../../../models/Proposal.js';
import Conversation from '../../../models/Conversation.js';

jest.mock('../../../models/Contract.js');
jest.mock('../../../models/Proposal.js');
jest.mock('../../../models/Conversation.js');

// helper to create chainable query result
const makeChain = (value) => {
  const q = {};
  q.populate = jest.fn(() => q);
  q.sort = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.skip = jest.fn(() => q);
  q.then = (cb) => cb(value);
  q.lean = jest.fn().mockResolvedValue(value);
  return q;
};

describe('Contract Service', () => {
  beforeEach(() => jest.restoreAllMocks());

  describe('createFromProposal', () => {
    test('requires authentication', async () => {
      await expect(ContractService.createFromProposal('p1', null, {})).rejects.toThrow('Not authenticated');
    });

    test('throws when proposal not found', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(null));
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Proposal not found');
    });

    test('throws when job/freelancer missing', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain({ status: 'accepted' }));
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Job associated with proposal not found');

      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain({ status: 'accepted', jobId: { _id: 'j1' } }));
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Freelancer associated with proposal not found');
    });

    test('throws for non-accepted proposal', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain({ status: 'pending', jobId: { client: 'c1', _id: 'j1' }, freelancerId: 'f1' }));
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Only accepted proposals can be converted to contracts');
    });

    test('throws when contract exists', async () => {
      const proposal = { status: 'accepted', jobId: { client: 'c1', _id: 'j1' }, freelancerId: { _id: 'f2' }, _id: 'p1' };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(proposal));
      jest.spyOn(Contract, 'findOne').mockResolvedValue({ _id: 'existing' });
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Contract already exists for this proposal');
    });

    test('throws when client missing on job', async () => {
      const proposal = { status: 'accepted', jobId: { _id: 'j1' }, freelancerId: { _id: 'f2' }, _id: 'p1' };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(proposal));
      jest.spyOn(Contract, 'findOne').mockResolvedValue(null);

      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Job client information is missing');
    });

    test('throws when client mismatch or same as freelancer', async () => {
      const proposal = { status: 'accepted', jobId: { client: 'cX', _id: 'j1' }, freelancerId: { _id: 'f2' }, _id: 'p1', bidAmount: 100 };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(proposal));
      jest.spyOn(Contract, 'findOne').mockResolvedValue(null);
      // client mismatch
      await expect(ContractService.createFromProposal('p1', 'c1', {})).rejects.toThrow('Only the job client can create a contract');

      // same user
      const sameProposal = { status: 'accepted', jobId: { client: 'u1', _id: 'j1' }, freelancerId: 'u1', _id: 'p1', bidAmount: 100 };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(sameProposal));
      await expect(ContractService.createFromProposal('p1', 'u1', {})).rejects.toThrow('Client and freelancer must be different users');
    });

    test('creates contract successfully', async () => {
      const proposal = {
        _id: 'p1',
        status: 'accepted',
        jobId: { client: 'c1', _id: 'j1', title: 'JobTitle', description: 'JD' },
        freelancerId: { _id: 'f1' },
        bidAmount: 200,
        paymentType: 'fixed',
      };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => makeChain(proposal));
      jest.spyOn(Contract, 'findOne').mockResolvedValue(null);

      // Mock Contract constructor to return object with save/populate
      const saved = { _id: 'c_1', populate: jest.fn().mockResolvedValue({ _id: 'c_1', client: 'c1' }) };
      const mockSave = jest.fn().mockResolvedValue(saved);
      const MockContract = jest.fn().mockImplementation(() => ({ save: mockSave, populate: saved.populate }));
      Contract.mockImplementation(MockContract);

      jest.spyOn(Conversation, 'findOrCreate').mockResolvedValue(true);

      const out = await ContractService.createFromProposal('p1', 'c1', { terms: 't', deadline: '2099-01-01' });
      expect(out).toEqual({ _id: 'c_1', client: 'c1' });
      expect(mockSave).toHaveBeenCalled();
      expect(Conversation.findOrCreate).toHaveBeenCalled();
    });
  });

  describe('getContractById', () => {
    test('throws when not found', async () => {
      jest.spyOn(Contract, 'findById').mockImplementation(() => makeChain(null));
      await expect(ContractService.getContractById('c1', 'u1')).rejects.toThrow('Contract not found');
    });

    test('throws when access denied', async () => {
      const contract = { canBeViewedBy: jest.fn().mockReturnValue(false) };
      jest.spyOn(Contract, 'findById').mockImplementation(() => makeChain(contract));
      await expect(ContractService.getContractById('c1', 'u1')).rejects.toThrow('You do not have access to this contract');
    });

    test('returns contract when authorized', async () => {
      const contract = { canBeViewedBy: jest.fn().mockReturnValue(true) };
      jest.spyOn(Contract, 'findById').mockImplementation(() => makeChain(contract));
      const out = await ContractService.getContractById('c1', 'u1');
      expect(out).toBe(contract);
    });
  });

  describe('getContractsByUser', () => {
    test('returns contracts with pagination and filters', async () => {
      const contracts = [{ _id: 'c1' }, { _id: 'c2' }];
      jest.spyOn(Contract, 'find').mockImplementation(() => makeChain(contracts));
      jest.spyOn(Contract, 'countDocuments').mockResolvedValue(2);

      const out = await ContractService.getContractsByUser('u1', { page: '1', limit: '10' });
      expect(out.contracts).toEqual(contracts);
      expect(out.pagination.total).toBe(2);
    });

    test('applies role filters', async () => {
      const contracts = [{ _id: 'c1' }];
      jest.spyOn(Contract, 'find').mockImplementation(() => makeChain(contracts));
      jest.spyOn(Contract, 'countDocuments').mockResolvedValue(1);

      const out = await ContractService.getContractsByUser('u1', { role: 'client' });
      expect(out.contracts).toEqual(contracts);
    });
  });

  describe('respondToContract', () => {
    test('validates inputs and not found', async () => {
      await expect(ContractService.respondToContract(null, 'u1', 'accept')).rejects.toThrow('Contract ID is required');
      await expect(ContractService.respondToContract('c1', null, 'accept')).rejects.toThrow('User ID is required');
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(ContractService.respondToContract('c1', 'u1', 'accept')).rejects.toThrow('Contract not found');
    });

    test('rejects when freelancer missing or not pending or unauthorized', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue({ freelancer: null });
      await expect(ContractService.respondToContract('c1', 'u1', 'accept')).rejects.toThrow('Contract freelancer data is missing');

      jest.spyOn(Contract, 'findById').mockResolvedValue({ freelancer: 'f1', status: 'active' });
      await expect(ContractService.respondToContract('c1', 'u1', 'accept')).rejects.toThrow('Contract is not in pending status');

      jest.spyOn(Contract, 'findById').mockResolvedValue({ freelancer: 'f1', status: 'pending', isFreelancer: jest.fn().mockReturnValue(false) });
      await expect(ContractService.respondToContract('c1', 'u1', 'accept')).rejects.toThrow('Only the freelancer can respond to the contract');
    });

    test('accepts and declines successfully', async () => {
      const contract = {
        _id: 'c1',
        freelancer: 'f1',
        status: 'pending',
        isFreelancer: jest.fn().mockReturnValue(true),
        canTransitionTo: jest.fn().mockReturnValue(true),
        save: jest.fn().mockResolvedValue(true),
        populate: jest.fn().mockResolvedValue({ _id: 'c1' }),
      };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      jest.spyOn(Conversation, 'findOneAndUpdate').mockResolvedValue(true);

      const outA = await ContractService.respondToContract('c1', 'f1', 'accept');
      expect(outA).toEqual({ _id: 'c1' });

      // decline
      contract.status = 'pending';
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      const outD = await ContractService.respondToContract('c1', 'f1', 'decline', 'no');
      expect(outD).toEqual({ _id: 'c1' });
    });
  });

  describe('milestone operations', () => {
    test('addMilestone validations and success', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(ContractService.addMilestone('c1', 'u1', {})).rejects.toThrow('Contract not found');

      const contract = {
        canBeModifiedBy: jest.fn().mockReturnValue(false),
      };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.addMilestone('c1', 'u1', {})).rejects.toThrow('You do not have access to this contract');

      // not client
      contract.canBeModifiedBy = jest.fn().mockReturnValue(true);
      contract.isClient = jest.fn().mockReturnValue(false);
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.addMilestone('c1', 'u1', {})).rejects.toThrow('Only the client can add milestones');

      // cannot add milestone due to status
      contract.isClient = jest.fn().mockReturnValue(true);
      contract.canAddMilestone = jest.fn().mockReturnValue(false);
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.addMilestone('c1', 'u1', {})).rejects.toThrow('Cannot add milestone');

      // dueDate in past
      contract.canAddMilestone = jest.fn().mockReturnValue(true);
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.addMilestone('c1', 'u1', { dueDate: '2000-01-01' })).rejects.toThrow('Milestone due date cannot be in the past');

      // success
      const save = jest.fn().mockResolvedValue(true);
      const okContract = { canBeModifiedBy: jest.fn().mockReturnValue(true), isClient: jest.fn().mockReturnValue(true), canAddMilestone: jest.fn().mockReturnValue(true), milestones: [], save };
      jest.spyOn(Contract, 'findById').mockResolvedValue(okContract);
      const out = await ContractService.addMilestone('c1', 'u1', { title: 'm1' });
      expect(out).toBe(okContract);
      expect(save).toHaveBeenCalled();
    });

    test('updateMilestone validations and success', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(ContractService.updateMilestone('c1', 'm1', 'u1', {})).rejects.toThrow('Contract not found');

      const contract = { canBeModifiedBy: jest.fn().mockReturnValue(false) };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.updateMilestone('c1', 'm1', 'u1', {})).rejects.toThrow('You do not have access to this contract');

      // terminal status
      contract.canBeModifiedBy = jest.fn().mockReturnValue(true);
      contract.status = 'completed';
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.updateMilestone('c1', 'm1', 'u1', {})).rejects.toThrow('Cannot update milestone');

      // milestone not found
      contract.status = 'active';
      contract.milestones = { id: jest.fn().mockReturnValue(null) };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.updateMilestone('c1', 'm1', 'u1', {})).rejects.toThrow('Milestone not found');

      // dueDate invalid
      const milestone = {}; 
      contract.milestones = { id: jest.fn().mockReturnValue(milestone) };
      contract.deadline = null;
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.updateMilestone('c1', 'm1', 'u1', { dueDate: '2000-01-01' })).rejects.toThrow('Milestone due date cannot be in the past');

      // success and completedAt auto-set
      milestone.completedAt = null;
      jest.spyOn(Contract, 'findById').mockResolvedValue({ canBeModifiedBy: jest.fn().mockReturnValue(true), status: 'active', milestones: { id: jest.fn().mockReturnValue(milestone) }, save: jest.fn().mockResolvedValue(true), deadline: null });
      const out = await ContractService.updateMilestone('c1', 'm1', 'u1', { status: 'completed' });
      expect(out).toBeDefined();
    });
  });

  describe('complete and cancel', () => {
    test('completeContract validations and success', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(ContractService.completeContract('c1', 'u1')).rejects.toThrow('Contract not found');

      const contract = { canBeModifiedBy: jest.fn().mockReturnValue(false) };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.completeContract('c1', 'u1')).rejects.toThrow('You do not have access to this contract');

      contract.canBeModifiedBy = jest.fn().mockReturnValue(true);
      contract.isClient = jest.fn().mockReturnValue(false);
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.completeContract('c1', 'u1')).rejects.toThrow('Only the client can complete the contract');

      contract.isClient = jest.fn().mockReturnValue(true);
      contract.status = 'pending';
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.completeContract('c1', 'u1')).rejects.toThrow('Only active contracts can be completed');

      const good = { canBeModifiedBy: jest.fn().mockReturnValue(true), isClient: jest.fn().mockReturnValue(true), status: 'active', canTransitionTo: jest.fn().mockReturnValue(true), save: jest.fn().mockResolvedValue(true), _id: 'c1' };
      jest.spyOn(Contract, 'findById').mockResolvedValue(good);
      jest.spyOn(Conversation, 'findOneAndUpdate').mockResolvedValue(true);
      const out = await ContractService.completeContract('c1', 'u1');
      expect(out).toBe(good);
    });

    test('cancelContract validations and success', async () => {
      jest.spyOn(Contract, 'findById').mockResolvedValue(null);
      await expect(ContractService.cancelContract('c1', 'u1', 'r')).rejects.toThrow('Contract not found');

      const contract = { canBeModifiedBy: jest.fn().mockReturnValue(false) };
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.cancelContract('c1', 'u1', 'r')).rejects.toThrow('You do not have access to this contract');

      contract.canBeModifiedBy = jest.fn().mockReturnValue(true);
      contract.isClient = jest.fn().mockReturnValue(false);
      jest.spyOn(Contract, 'findById').mockResolvedValue(contract);
      await expect(ContractService.cancelContract('c1', 'u1', 'r')).rejects.toThrow('Only the client can cancel the contract');

      contract.isClient = jest.fn().mockReturnValue(true);
      jest.spyOn(Contract, 'findById').mockResolvedValue({ canBeModifiedBy: jest.fn().mockReturnValue(true), isClient: jest.fn().mockReturnValue(true), status: 'completed', canTransitionTo: jest.fn().mockReturnValue(false) });
      await expect(ContractService.cancelContract('c1', 'u1', 'r')).rejects.toThrow('Cannot cancel contract in');

      const ok = { canBeModifiedBy: jest.fn().mockReturnValue(true), isClient: jest.fn().mockReturnValue(true), status: 'active', canTransitionTo: jest.fn().mockReturnValue(true), save: jest.fn().mockResolvedValue(true), _id: 'c2' };
      jest.spyOn(Contract, 'findById').mockResolvedValue(ok);
      jest.spyOn(Conversation, 'findOneAndUpdate').mockResolvedValue(true);
      const out = await ContractService.cancelContract('c2', 'u1', 'reason');
      expect(out).toBe(ok);
    });
  });

  describe('getContractStats', () => {
    test('aggregates properly', async () => {
      const contracts = [
        { status: 'completed', freelancer: { toString: () => 'u2' }, client: { toString: () => 'u1' }, totalAmount: 100 },
        { status: 'active', freelancer: { toString: () => 'u2' }, client: { toString: () => 'u1' }, totalAmount: 50 },
      ];
      jest.spyOn(Contract, 'find').mockResolvedValue(contracts);

      const statsForClient = await ContractService.getContractStats('u1');
      expect(statsForClient.total).toBe(2);
      expect(statsForClient.totalSpent).toBe(100);

      const statsForFreelancer = await ContractService.getContractStats('u2');
      expect(statsForFreelancer.totalEarned).toBe(100);
    });
  });
});