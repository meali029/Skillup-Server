import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as CNICController from '../../modules/cnic/cnic.controller.js';
import User from '../../models/User.js';

// Mock cnic service to isolate controller behavior
jest.mock('../../modules/cnic/cnic.service.js', () => ({
  submitCNIC: jest.fn(),
  getMyCNICStatus: jest.fn(),
  getPendingCNICs: jest.fn(),
  getCNICDetails: jest.fn(),
  approveCNIC: jest.fn(),
  rejectCNIC: jest.fn(),
  requestReupload: jest.fn(),
  getCNICStats: jest.fn(),
}));

// Mock audit logger
jest.mock('../../core/utils/auditLogger.js', () => ({ createAuditLog: jest.fn() }));

import * as cnicService from '../../modules/cnic/cnic.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  res.get = jest.fn(()=>'ua');
  return res;
};

describe('CNIC Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('submitCNIC passes files and user to service and returns 201', async () => {
    const u = await User.create({ name: 'SU', email: 'su@example.com' });
    cnicService.submitCNIC.mockResolvedValue({ message: 'ok' });

    const req = { user: { id: u._id }, files: { frontImage: [{ path: '/tmp/f.png' }], backImage: [{ path: '/tmp/b.png' }] } };
    const res = buildRes();

    await CNICController.submitCNIC(req, res);
    expect(cnicService.submitCNIC).toHaveBeenCalledWith(u._id, req.files);
    expect(res.statusCode).toBe(201);
    expect(res.payload.success).toBe(true);
  });

  it('getMyCNICStatus returns user cnic status', async () => {
    const u = await User.create({ name: 'GMS', email: 'gms@example.com' });
    cnicService.getMyCNICStatus.mockResolvedValue({ status: 'not_submitted' });

    const req = { user: { id: u._id } };
    const res = buildRes();

    await CNICController.getMyCNICStatus(req, res);
    expect(cnicService.getMyCNICStatus).toHaveBeenCalledWith(u._id);
    expect(res.payload.data.status).toBe('not_submitted');
  });

  it('getPendingCNICs forwards query params and returns pagination', async () => {
    cnicService.getPendingCNICs.mockResolvedValue({ users: [], pagination: { page: 1 } });
    const req = { query: { page: '1', limit: '10', status: 'pending' } };
    const res = buildRes();

    await CNICController.getPendingCNICs(req, res);
    expect(cnicService.getPendingCNICs).toHaveBeenCalledWith({ page: 1, limit: 10, status: 'pending', search: undefined });
    expect(res.payload.success).toBe(true);
  });

  it('getCNICDetails returns user details', async () => {
    const user = await User.create({ name: 'D', email: 'd@example.com' });
    cnicService.getCNICDetails.mockResolvedValue(user);

    const req = { params: { userId: user._id } };
    const res = buildRes();

    await CNICController.getCNICDetails(req, res);
    expect(cnicService.getCNICDetails).toHaveBeenCalledWith(user._id);
    expect(res.payload.data._id.toString()).toBe(user._id.toString());
  });

  it('approveCNIC calls service and creates audit log', async () => {
    const admin = await User.create({ name: 'A', email: 'a@ex.com', role: 'admin', adminRole: 'admin' });
    const target = await User.create({ name: 'T', email: 't@ex.com' });
    cnicService.approveCNIC.mockResolvedValue({ message: 'CNIC verified', user: { name: 'T', email: 't@ex.com' } });

    const req = { params: { userId: target._id }, user: { id: admin._id }, body: { number: '12345-1234567-1' }, ip: '1.2.3.4', get: () => 'agent' };
    const res = buildRes();

    await CNICController.approveCNIC(req, res);
    expect(cnicService.approveCNIC).toHaveBeenCalledWith(target._id, admin._id, req.body);
    expect(res.payload.message).toBe('CNIC verified');
  });

  it('rejectCNIC calls service and creates audit log', async () => {
    const admin = await User.create({ name: 'A2', email: 'a2@ex.com', role: 'admin', adminRole: 'admin' });
    const target = await User.create({ name: 'T2', email: 't2@ex.com' });
    cnicService.rejectCNIC.mockResolvedValue({ message: 'CNIC rejected', user: { name: 'T2', email: 't2@ex.com' } });

    const req = { params: { userId: target._id }, user: { id: admin._id }, body: { reason: 'Not valid' }, ip: '1.2.3.4', get: () => 'agent' };
    const res = buildRes();

    await CNICController.rejectCNIC(req, res);
    expect(cnicService.rejectCNIC).toHaveBeenCalledWith(target._id, admin._id, 'Not valid');
    expect(res.payload.message).toBe('CNIC rejected');
  });

  it('requestReupload forwards reason and returns message', async () => {
    const admin = await User.create({ name: 'A3', email: 'a3@ex.com', role: 'admin', adminRole: 'admin' });
    const target = await User.create({ name: 'T3', email: 't3@ex.com' });
    cnicService.requestReupload.mockResolvedValue({ message: 'Re-upload requested', user: { name: 'T3' } });

    const req = { params: { userId: target._id }, user: { id: admin._id }, body: { reason: 'Blurry image' } };
    const res = buildRes();

    await CNICController.requestReupload(req, res);
    expect(cnicService.requestReupload).toHaveBeenCalledWith(target._id, admin._id, 'Blurry image');
    expect(res.payload.message).toBe('Re-upload requested');
  });

  it('getCNICStats returns stats', async () => {
    cnicService.getCNICStats.mockResolvedValue({ pending: 1 });
    const req = {};
    const res = buildRes();

    await CNICController.getCNICStats(req, res);
    expect(res.payload.data.pending).toBe(1);
  });
});