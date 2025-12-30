import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as ProposalController from '../../modules/proposals/proposal.controller.js';

// Helpers to adapt tests to controller method names
const submit = ProposalController.submitProposal;
const getDetails = ProposalController.getProposalDetails;
const update = ProposalController.updateProposal;
const withdraw = ProposalController.withdrawProposal;
const accept = ProposalController.acceptProposal;
const reject = ProposalController.rejectProposal;
import User from '../../models/User.js';

// Mock proposal service
jest.mock('../../modules/proposals/proposal.service.js', () => ({
  createProposal: jest.fn(),
  getProposalById: jest.fn(),
  updateProposal: jest.fn(),
  withdrawProposal: jest.fn(),
  acceptProposal: jest.fn(),
  rejectProposal: jest.fn(),
}));

import * as proposalService from '../../modules/proposals/proposal.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('Proposal Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('createProposal calls service and returns created proposal', async () => {
    const freelancer = await User.create({ name: 'F', email: 'f@ex.com' });
    proposalService.createProposal.mockResolvedValue({ _id: 'p1', bidAmount: 1000 });

    const req = { validatedData: { jobId: 'j1', bidAmount: 1000 }, user: { id: freelancer._id } };
    const res = buildRes();

    await submit(req, res);
    expect(proposalService.createProposal).toHaveBeenCalledWith(freelancer._id, req.validatedData || req.body);
    expect(res.statusCode).toBe(201);
    expect(res.payload.data.proposal._id).toBe('p1');
  });

  it('getProposalById fetches proposal', async () => {
    proposalService.getProposalById.mockResolvedValue({ _id: 'p1' });
    const req = { params: { id: 'p1' }, user: { id: null } };
    const res = buildRes();

    await getDetails(req, res);
    expect(proposalService.getProposalById).toHaveBeenCalledWith('p1', null);
  });

  it('updateProposal updates and returns proposal', async () => {
    const freelancer = await User.create({ name: 'F2', email: 'f2@ex.com' });
    proposalService.updateProposal.mockResolvedValue({ _id: 'p2', bidAmount: 2000 });

    const req = { params: { id: 'p2' }, validatedData: { bidAmount: 2000 }, user: { id: freelancer._id } };
    const res = buildRes();

    await ProposalController.updateProposal(req, res);
    expect(proposalService.updateProposal).toHaveBeenCalledWith('p2', freelancer._id, req.validatedData);
  });

  it('withdrawProposal calls withdraw and returns message', async () => {
    const freelancer = await User.create({ name: 'FW', email: 'fw@ex.com' });
    proposalService.withdrawProposal.mockResolvedValue({ message: 'Withdrawn' });

    const req = { params: { id: 'p3' }, user: { id: freelancer._id } };
    const res = buildRes();

    await withdraw(req, res);
    expect(proposalService.withdrawProposal).toHaveBeenCalledWith('p3', freelancer._id);
    expect(res.payload.message).toBe('Proposal withdrawn successfully');
  });

  it('acceptProposal calls service and returns updated proposal', async () => {
    const client = await User.create({ name: 'C', email: 'c@ex.com' });
    proposalService.acceptProposal.mockResolvedValue({ proposal: { _id: 'p4', status: 'accepted' }, conversation: { _id: 'conv1' } });

    const req = { params: { id: 'p4' }, user: { id: client._id } };
    const res = buildRes();

    await accept(req, res);
    expect(proposalService.acceptProposal).toHaveBeenCalledWith('p4', client._id);
    expect(res.payload.data.proposal.status).toBe('accepted');
    expect(res.payload.data.conversation._id).toBe('conv1');
  });

  it('rejectProposal calls service and returns updated proposal', async () => {
    const client = await User.create({ name: 'C2', email: 'c2@ex.com' });
    proposalService.rejectProposal.mockResolvedValue({ _id: 'p5', status: 'rejected' });

    const req = { params: { id: 'p5' }, user: { id: client._id }, body: { reason: 'Not fit' } };
    const res = buildRes();

    await reject(req, res);
    expect(proposalService.rejectProposal).toHaveBeenCalledWith('p5', client._id, 'Not fit');
    expect(res.payload.data.proposal.status).toBe('rejected');
  });
});