import * as controller from '../../../../modules/admin/jobs/job-checker.controller.js';
import * as jobService from '../../../../modules/admin/jobs/job-checker.service.js';
import { createAuditLog } from '../../../../core/utils/auditLogger.js';

jest.mock('../../../../modules/admin/jobs/job-checker.service.js');
jest.mock('../../../../core/utils/auditLogger.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('job-checker.controller', () => {
  test('getAllJobs returns data on success', async () => {
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    jobService.getAllJobs.mockResolvedValue({ jobs: [], pagination: {} });

    await controller.getAllJobs(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('getAllJobs calls next on error', async () => {
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    jobService.getAllJobs.mockRejectedValue(new Error('fail'));

    await controller.getAllJobs(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('getJobById returns job when found', async () => {
    const req = { params: { id: 'j1' } };
    const res = mockRes();
    const next = jest.fn();

    jobService.getJobById.mockResolvedValue({ _id: 'j1' });

    await controller.getJobById(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ _id: 'j1' }) }));
  });

  test('getJobById forwards not found to next', async () => {
    const req = { params: { id: 'x' } };
    const res = mockRes();
    const next = jest.fn();

    jobService.getJobById.mockResolvedValue(null);

    await controller.getJobById(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('approveJob creates audit log and returns job', async () => {
    const job = { _id: 'j1', title: 'T', client: 'c1' };
    const req = { params: { id: 'j1' }, user: { id: 'admin1' }, ip: '1.2.3.4', get: jest.fn().mockReturnValue('ua') };
    const res = mockRes();
    const next = jest.fn();

    jobService.approveJob.mockResolvedValue(job);
    createAuditLog.mockResolvedValue(true);

    await controller.approveJob(req, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejectJob creates audit log and returns job', async () => {
    const job = { _id: 'j1', title: 'T', client: 'c1' };
    const req = { params: { id: 'j1' }, body: { reason: 'bad' }, user: { id: 'admin1' }, ip: '1.2.3.4', get: jest.fn().mockReturnValue('ua') };
    const res = mockRes();
    const next = jest.fn();

    jobService.rejectJob.mockResolvedValue(job);
    createAuditLog.mockResolvedValue(true);

    await controller.rejectJob(req, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('flagJob creates audit log and returns job', async () => {
    const job = { _id: 'j1', title: 'T', client: 'c1' };
    const req = { params: { id: 'j1' }, body: { reason: 'x', flagType: 'y' }, user: { id: 'admin1' }, ip: '1.2.3.4', get: jest.fn().mockReturnValue('ua') };
    const res = mockRes();
    const next = jest.fn();

    jobService.flagJob.mockResolvedValue(job);
    createAuditLog.mockResolvedValue(true);

    await controller.flagJob(req, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('toggleFeature creates audit log and returns job', async () => {
    const job = { _id: 'j1', title: 'T', client: 'c1', isFeatured: true };
    const req = { params: { id: 'j1' }, user: { id: 'admin1' }, ip: '1.2.3.4', get: jest.fn().mockReturnValue('ua') };
    const res = mockRes();
    const next = jest.fn();

    jobService.toggleFeature.mockResolvedValue(job);
    createAuditLog.mockResolvedValue(true);

    await controller.toggleFeature(req, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('deleteJob creates audit log and returns success', async () => {
    const job = { _id: 'j1', title: 'T', client: 'c1' };
    const req = { params: { id: 'j1' }, user: { id: 'admin1' }, ip: '1.2.3.4', get: jest.fn().mockReturnValue('ua') };
    const res = mockRes();
    const next = jest.fn();

    jobService.getJobById.mockResolvedValue(job);
    jobService.deleteJob.mockResolvedValue(true);
    createAuditLog.mockResolvedValue(true);

    await controller.deleteJob(req, res, next);
    expect(createAuditLog).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('getJobStats returns data', async () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    jobService.getJobStats.mockResolvedValue({ total: 1 });

    await controller.getJobStats(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 1 }) }));
  });
});