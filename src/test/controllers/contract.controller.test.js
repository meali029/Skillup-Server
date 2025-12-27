import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as ContractController from '../../modules/contracts/contract.controller.js';
import User from '../../models/User.js';

// Mock contract service
jest.mock('../../modules/contracts/contract.service.js', () => ({
  createFromProposal: jest.fn(),
  getContractsByUser: jest.fn(),
  getContractById: jest.fn(),
  respondToContract: jest.fn(),
  addMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  completeContract: jest.fn(),
  cancelContract: jest.fn(),
  getContractStats: jest.fn(),
}));

import * as contractService from '../../modules/contracts/contract.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  res.get = jest.fn(()=>'ua');
  return res;
};

describe('Contract Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('createFromProposal calls service and returns 201', async () => {
    const client = await User.create({ name: 'C1', email: 'c1@example.com' });
    contractService.createFromProposal.mockResolvedValue({ _id: 'contract1' });

    const req = { body: { proposalId: 'p1', terms: 't' }, user: { id: client._id } };
    const res = buildRes();

    await ContractController.createFromProposal(req, res);
    expect(contractService.createFromProposal).toHaveBeenCalledWith('p1', client._id, { terms: 't', deadline: undefined, milestones: undefined });
    expect(res.statusCode).toBe(201);
  });

  it('getMyContracts calls service with filters and returns pagination', async () => {
    const client = await User.create({ name: 'C2', email: 'c2@example.com', role: 'client' });
    contractService.getContractsByUser.mockResolvedValue({ contracts: [{ _id: 'c1' }], pagination: { page:1, limit:10, total:1 } });
    const req = { user: { id: client._id, role: 'client' }, query: { page: '1', limit: '10' } };
    const res = buildRes();

    await ContractController.getMyContracts(req, res);
    expect(contractService.getContractsByUser).toHaveBeenCalledWith(client._id, { status: undefined, role: undefined, page: '1', limit: '10', sortBy: undefined, order: undefined }, 'client');
  });

  it('getContract requires auth and returns contract', async () => {
    const user = await User.create({ name: 'U', email: 'u@ex.com' });
    contractService.getContractById.mockResolvedValue({ _id: 'ct1' });

    const req = { params: { id: 'ct1' }, user: { id: user._id } };
    const res = buildRes();

    await ContractController.getContract(req, res);
    expect(contractService.getContractById).toHaveBeenCalledWith('ct1', user._id);
    expect(res.payload.data.contract._id).toBe('ct1');
  });

  it('respondToContract returns accepted/declined message based on action', async () => {
    const freelancer = await User.create({ name: 'F', email: 'f@ex.com', role: 'freelancer' });
    contractService.respondToContract.mockResolvedValue({ _id: 'ct2', status: 'accepted' });

    const req = { params: { id: 'ct2' }, user: { id: freelancer._id }, body: { action: 'accept' } };
    const res = buildRes();

    await ContractController.respondToContract(req, res);
    expect(contractService.respondToContract).toHaveBeenCalledWith('ct2', freelancer._id, 'accept', undefined);
    expect(res.payload.data.contract._id).toBe('ct2');
  });

  it('addMilestone/updateMilestone/complete/cancel/getMyStats passthroughs', async () => {
    const client = await User.create({ name: 'CL', email: 'cl@ex.com', role: 'client' });
    contractService.addMilestone.mockResolvedValue({ _id: 'ct3' });
    contractService.updateMilestone.mockResolvedValue({ _id: 'ct3' });
    contractService.completeContract.mockResolvedValue({ _id: 'ct3' });
    contractService.cancelContract.mockResolvedValue({ _id: 'ct3' });
    contractService.getContractStats.mockResolvedValue({ active: 1 });

    let req = { params: { id: 'ct3' }, user: { id: client._id }, body: { title: 'ms', amount: 100 } };
    let res = buildRes();

    await ContractController.addMilestone(req, res);
    expect(contractService.addMilestone).toHaveBeenCalledWith('ct3', client._id, { title: 'ms', amount: 100 });

    req = { params: { id: 'ct3', milestoneId: 'm1' }, user: { id: client._id }, body: { amount: 200 } };
    res = buildRes();
    await ContractController.updateMilestone(req, res);
    expect(contractService.updateMilestone).toHaveBeenCalledWith('ct3', 'm1', client._id, { amount: 200 });

    req = { params: { id: 'ct3' }, user: { id: client._id } };
    res = buildRes();
    await ContractController.completeContract(req, res);
    expect(contractService.completeContract).toHaveBeenCalledWith('ct3', client._id);

    req = { params: { id: 'ct3' }, user: { id: client._id }, body: { reason: 'cancel' } };
    res = buildRes();
    await ContractController.cancelContract(req, res);
    expect(contractService.cancelContract).toHaveBeenCalledWith('ct3', client._id, 'cancel');

    req = { user: { id: client._id } };
    res = buildRes();
    await ContractController.getMyStats(req, res);
    expect(res.payload.data.stats.active).toBe(1);
  });
});