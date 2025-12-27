import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as JobController from '../../modules/jobs/job.controller.js';
import User from '../../models/User.js';

// Mock job service
jest.mock('../../modules/jobs/job.service.js', () => ({
  createJob: jest.fn(),
  getAllJobs: jest.fn(),
  getJobById: jest.fn(),
  updateJob: jest.fn(),
  deleteJob: jest.fn(),
  getClientJobs: jest.fn(),
  closeJob: jest.fn(),
  getJobStats: jest.fn(),
  getRecommendedJobs: jest.fn(),
  getRecommendedFreelancers: jest.fn(),
}));

import * as jobService from '../../modules/jobs/job.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('Job Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('createJob calls service and returns 201', async () => {
    const user = await User.create({ name: 'J1', email: 'j1@example.com' });
    jobService.createJob.mockResolvedValue({ _id: 'j1', title: 'T' });

    const req = { validatedData: { title: 'T' }, user: { id: user._id } };
    const res = buildRes();

    await JobController.createJob(req, res);
    expect(jobService.createJob).toHaveBeenCalledWith(req.validatedData, user._id);
    expect(res.statusCode).toBe(201);
  });

  it('getAllJobs paginates and returns jobs', async () => {
    jobService.getAllJobs.mockResolvedValue({ jobs: [{ _id: 'j1' }], pagination: { page:1, limit:10, total:1 } });
    const req = { query: {} };
    const res = buildRes();

    await JobController.getAllJobs(req, res);
    expect(jobService.getAllJobs).toHaveBeenCalledWith({});
    expect(res.payload.pagination).toBeDefined();
  });

  it('getJobById fetches job', async () => {
    jobService.getJobById.mockResolvedValue({ _id: 'j1', title: 'T' });
    const req = { params: { id: 'j1' } };
    const res = buildRes();

    await JobController.getJobById(req, res);
    expect(jobService.getJobById).toHaveBeenCalledWith('j1');
    expect(res.payload.data.job.id).toBe('j1');
  });

  it('updateJob calls service and returns updated job', async () => {
    const user = await User.create({ name: 'U2', email: 'u2@example.com' });
    jobService.updateJob.mockResolvedValue({ _id: 'j2', title: 'Updated' });
    const req = { params: { id: 'j2' }, user: { id: user._id }, validatedData: { title: 'Updated' } };
    const res = buildRes();

    await JobController.updateJob(req, res);
    expect(jobService.updateJob).toHaveBeenCalledWith('j2', user._id, req.validatedData);
    expect(res.payload.data.job.title).toBe('Updated');
  });

  it('deleteJob calls service', async () => {
    jobService.deleteJob.mockResolvedValue({ message: 'Deleted' });
    const req = { params: { id: 'j3' }, user: { id: 'u' } };
    const res = buildRes();

    await JobController.deleteJob(req, res);
    expect(jobService.deleteJob).toHaveBeenCalledWith('j3', 'u');
    expect(res.payload.message).toBe('Deleted');
  });

  it('getMyJobs returns paginated client jobs', async () => {
    const user = await User.create({ name: 'C', email: 'c@ex.com' });
    jobService.getClientJobs.mockResolvedValue({ jobs: [], pagination: { page:1, limit:10, total:0 } });
    const req = { user: { id: user._id }, query: { page: '1', limit: '10' } };
    const res = buildRes();

    await JobController.getMyJobs(req, res);
    expect(jobService.getClientJobs).toHaveBeenCalledWith(user._id, { page: '1', limit: '10', status: undefined });
  });

  it('closeJob closes and returns job', async () => {
    const user = await User.create({ name: 'Owner', email: 'owner@ex.com' });
    jobService.closeJob.mockResolvedValue({ _id: 'j4', status: 'closed' });
    const req = { params: { id: 'j4' }, user: { id: user._id } };
    const res = buildRes();

    await JobController.closeJob(req, res);
    expect(jobService.closeJob).toHaveBeenCalledWith('j4', user._id);
    expect(res.payload.data.job.status).toBe('closed');
  });

  it('getJobStats returns user stats', async () => {
    jobService.getJobStats.mockResolvedValue({ open:1 });
    const req = { user: { id: 'u1' } };
    const res = buildRes();

    await JobController.getJobStats(req, res);
    expect(res.payload.data.stats.open).toBe(1);
  });

  it('getRecommendedJobs returns jobs', async () => {
    jobService.getRecommendedJobs.mockResolvedValue([{ _id: 'r1' }]);
    const req = { user: { id: 'freelancer1' } };
    const res = buildRes();

    await JobController.getRecommendedJobs(req, res);
    expect(jobService.getRecommendedJobs).toHaveBeenCalledWith('freelancer1');
    expect(res.payload.data.jobs.length).toBe(1);
  });

  it('getRecommendedFreelancers returns freelancers', async () => {
    jobService.getRecommendedFreelancers.mockResolvedValue([{ id: 'f1' }]);
    const req = { params: { id: 'j5' }, query: { limit: '5', minScore: '10' } };
    const res = buildRes();

    await JobController.getRecommendedFreelancers(req, res);
    expect(jobService.getRecommendedFreelancers).toHaveBeenCalledWith('j5', { limit: '5', minScore: '10' });
    expect(res.payload.data.freelancers.length).toBe(1);
  });
});