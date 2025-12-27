import * as JobService from '../../../modules/jobs/job.service.js';
import Job from '../../../models/Job.js';
import User from '../../../models/User.js';
import matchingService from '../../../services/matching/matching.service.js';

jest.mock('../../../models/Job.js');
jest.mock('../../../models/User.js');
jest.mock('../../../services/matching/matching.service.js');

describe('Job service', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('createJob saves and updates user counters', async () => {
    // Mock Job constructor to yield instance with save & populate
    Job.mockImplementation(function (data) {
      this.save = jest.fn().mockResolvedValue();
      this.populate = jest.fn().mockResolvedValue(this);
      Object.assign(this, data);
    });

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(true);

    const job = await JobService.createJob({ title: 'T' }, 'c1');
    expect(job.save).toHaveBeenCalled();
    expect(job.client).toBe('c1');
    expect(updateSpy).toHaveBeenCalled();
  });

  test('getAllJobs filters, pagination and filters banned clients', async () => {
    const jobs = [
      { _id: 'j1', client: { isActive: true, isBanned: false } },
      { _id: 'j2', client: { isActive: false } }
    ];

    jest.spyOn(Job, 'find').mockImplementation(() => ({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(jobs),
    }));

    jest.spyOn(Job, 'countDocuments').mockResolvedValue(2);

    const res = await JobService.getAllJobs({ page: 1, limit: 10 });
    expect(res.jobs.length).toBe(1); // one filtered out
    expect(res.pagination.page).toBe(1);
  });

  test('getJobById throws when not found or banned', async () => {
    jest.spyOn(Job, 'findOne').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }));
    await expect(JobService.getJobById('x')).rejects.toThrow();

    jest.spyOn(Job, 'findOne').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue({ client: { isActive: false } }) }));
    await expect(JobService.getJobById('x')).rejects.toThrow();
  });

  test('getJobById increments views on success', async () => {
    const job = { client: { isActive: true, isBanned: false }, incrementViews: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Job, 'findOne').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(job) }));

    const out = await JobService.getJobById('x');
    expect(job.incrementViews).toHaveBeenCalled();
    expect(out).toBe(job);
  });

  test('updateJob enforces restrictions and updates', async () => {
    // Not found
    jest.spyOn(Job, 'findOne').mockResolvedValue(null);
    await expect(JobService.updateJob('j1', 'u1', { title: 'x' })).rejects.toThrow();

    const job = { proposalsCount: 1, save: jest.fn().mockResolvedValue(true), populate: jest.fn() };
    jest.spyOn(Job, 'findOne').mockResolvedValue(job);
    await expect(JobService.updateJob('j1', 'u1', { budgetAmount: 100 })).rejects.toThrow();

    // success path
    job.proposalsCount = 0;
    jest.spyOn(Job, 'findOne').mockResolvedValue(job);
    jest.spyOn(Job, 'findOne').mockResolvedValue(job);
    const out = await JobService.updateJob('j1', 'u1', { title: 'New' });
    expect(job.save).toHaveBeenCalled();
  });

  test('deleteJob handles draft, soft delete and blocks when proposals exist', async () => {
    // not found
    jest.spyOn(Job, 'findOne').mockResolvedValue(null);
    await expect(JobService.deleteJob('j1', 'u1')).rejects.toThrow();

    // draft deletion
    const draft = { status: 'draft', proposalsCount: 0 };
    jest.spyOn(Job, 'findOne').mockResolvedValueOnce(draft);
    const delSpy = jest.spyOn(Job, 'findByIdAndDelete').mockResolvedValue(true);
    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(true);

    const res1 = await JobService.deleteJob('j1', 'u1');
    expect(delSpy).toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalled();

    // soft delete
    const soft = { status: 'open', proposalsCount: 0, save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Job, 'findOne').mockResolvedValueOnce(soft);
    const res2 = await JobService.deleteJob('j1', 'u1');
    expect(soft.save).toHaveBeenCalled();

    // blocked when proposals exist
    const blocked = { status: 'open', proposalsCount: 2 };
    jest.spyOn(Job, 'findOne').mockResolvedValueOnce(blocked);
    await expect(JobService.deleteJob('j1', 'u1')).rejects.toThrow();
  });

  test('getClientJobs returns jobs with pagination', async () => {
    const j = [{ _id: 'j1' }];
    jest.spyOn(Job, 'find').mockImplementation(() => ({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(j) }));
    jest.spyOn(Job, 'countDocuments').mockResolvedValue(1);

    const out = await JobService.getClientJobs('c1', { page: 1, limit: 10 });
    expect(out.jobs).toEqual(j);
    expect(out.pagination.total).toBe(1);
  });

  test('closeJob updates status and user counters', async () => {
    jest.spyOn(Job, 'findOne').mockResolvedValue(null);
    await expect(JobService.closeJob('j1', 'u1')).rejects.toThrow();

    const job = { status: 'open', save: jest.fn().mockResolvedValue(true) };
    jest.spyOn(Job, 'findOne').mockResolvedValue(job);
    const userSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(true);

    const out = await JobService.closeJob('j1', 'u1');
    expect(job.save).toHaveBeenCalled();
    expect(userSpy).toHaveBeenCalled();
  });

  test('getJobStats aggregates and returns totals', async () => {
    jest.spyOn(Job, 'aggregate').mockResolvedValue([{ _id: 'open', count: 2, totalBudget: 100 }]);
    jest.spyOn(Job, 'countDocuments').mockResolvedValue(5);

    const out = await JobService.getJobStats('c1');
    expect(out.total).toBe(5);
    expect(out.byStatus.length).toBe(1);
  });

  test('completeJob enforces states and updates users on success', async () => {
    jest.spyOn(Job, 'findOne').mockResolvedValue(null);
    await expect(JobService.completeJob('j1', 'u1', 'f1', 100)).rejects.toThrow();

    const job = { status: 'in-progress', save: jest.fn().mockResolvedValue(true), budgetAmount: 200 };
    jest.spyOn(Job, 'findOne').mockResolvedValue(job);
    const userSpy = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(true);

    const out = await JobService.completeJob('j1', 'u1', 'f1', 150);
    expect(job.save).toHaveBeenCalled();
    expect(userSpy).toHaveBeenCalled();
    // Ensure there was an update for both client and freelancer
    expect(userSpy.mock.calls.some(c => c[0] === 'u1')).toBe(true);
    expect(userSpy.mock.calls.some(c => c[0] === 'f1')).toBe(true);
  });

  test('getRecommendedJobs errors for missing or wrong role and returns filtered list', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(JobService.getRecommendedJobs('u1')).rejects.toThrow();

    jest.spyOn(User, 'findById').mockResolvedValue({ role: 'client', skills: [] });
    await expect(JobService.getRecommendedJobs('u1')).rejects.toThrow();

    const user = { role: 'freelancer', skills: ['js'] };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const jobs = [{ _id: 'j1' }];
    jest.spyOn(Job, 'find').mockImplementation(() => ({ populate: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(jobs) }));

    // matchingService should be used
    jest.spyOn(matchingService, 'rankJobs').mockResolvedValue([{ ...jobs[0], matchScore: 30 }]);
    jest.spyOn(matchingService, 'filterJobsByMatchScore').mockImplementation(list => list);

    const out = await JobService.getRecommendedJobs('u1');
    expect(Array.isArray(out)).toBe(true);
  });

  test('getRecommendedFreelancers handles job not found, closed and no freelancers', async () => {
    jest.spyOn(Job, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }));
    await expect(JobService.getRecommendedFreelancers('j1')).rejects.toThrow();

    jest.spyOn(Job, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue({ status: 'closed' }) }));
    await expect(JobService.getRecommendedFreelancers('j1')).rejects.toThrow();

    const job = { status: 'open', skills: ['js'] };
    jest.spyOn(Job, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(job) }));
    jest.spyOn(User, 'find').mockImplementation(() => ({ select: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }));

    const out = await JobService.getRecommendedFreelancers('j1');
    expect(out).toEqual([]);

    jest.spyOn(User, 'find').mockImplementation(() => ({ select: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ _id: 'f1' }]) }));
    jest.spyOn(matchingService, 'rankFreelancers').mockResolvedValue([{ _id: 'f1', matchScore: 50 }]);
    jest.spyOn(matchingService, 'filterFreelancersByMatchScore').mockImplementation(list => list);

    const out2 = await JobService.getRecommendedFreelancers('j1', { limit: 5 });
    expect(out2.length).toBe(1);
  });
});