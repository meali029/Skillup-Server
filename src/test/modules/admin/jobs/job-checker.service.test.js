import * as svc from '../../../../modules/admin/jobs/job-checker.service.js';
import Job from '../../../../models/Job.js';
import User from '../../../../models/User.js';

jest.mock('../../../../models/Job.js');
jest.mock('../../../../models/User.js');
jest.mock('../../../../models/Proposal.js', () => ({ default: { countDocuments: jest.fn(), deleteMany: jest.fn() }, countDocuments: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../../../../sockets/index.js', () => ({ emitJobEvent: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
});

describe('admin job-checker.service', () => {
  describe('getAllJobs', () => {
    test('returns jobs and pagination with filters and dates', async () => {
      const jobs = [{ _id: 'j1' }, { _id: 'j2' }];
      Job.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(jobs),
      });
      Job.countDocuments.mockResolvedValue(2);

      const res = await svc.getAllJobs({ page: 2, limit: 1, startDate: '2020-01-01', endDate: '2020-02-01', isFlagged: 'true', isFeatured: 'false' });
      expect(res.jobs).toBe(jobs);
      expect(res.pagination.page).toBe(2);
      expect(res.pagination.limit).toBe(1);
      expect(res.pagination.total).toBe(2);
    });
  });

  describe('getJobById', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
      await expect(svc.getJobById('no')).rejects.toThrow(/Job not found/);
    });

    test('returns job with proposal count', async () => {
      const job = { _id: 'j1', client: 'c1' };
      jest.spyOn(Job, 'findById').mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(job) });
      const Proposal = (await import('../../../../models/Proposal.js')).default;
      Proposal.countDocuments.mockResolvedValue(5);

      const out = await svc.getJobById('j1');
      expect(out.proposalCount).toBe(5);
      expect(out._id).toBe('j1');
    });
  });

  describe('approveJob', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(svc.approveJob('x', 'admin1')).rejects.toThrow(/Job not found/);
    });

    test('approves and updates job fields', async () => {
      const save = jest.fn().mockResolvedValue(true);
      const job = { _id: 'j1', isFlagged: true, status: 'closed', save };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);

      const out = await svc.approveJob('j1', 'admin1');
      expect(save).toHaveBeenCalled();
      expect(out.isFlagged).toBe(false);
      expect(out.moderationStatus).toBe('approved');
      expect(out.moderatedBy).toBe('admin1');
      expect(out.status).toBe('open');
    });
  });

  describe('rejectJob', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(svc.rejectJob('x', 'r', 'admin')).rejects.toThrow(/Job not found/);
    });

    test('rejects job, saves and emits event', async () => {
      const save = jest.fn().mockResolvedValue(true);
      const job = { _id: 'j1', client: 'c1', save };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      const findAdmin = jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'a1', name: 'A' }) });
      const { emitJobEvent } = await import('../../../../sockets/index.js');

      const out = await svc.rejectJob('j1', 'bad', 'admin1');
      expect(save).toHaveBeenCalled();
      expect(out.moderationStatus).toBe('rejected');
      expect(emitJobEvent).toHaveBeenCalledWith('job:rejected', expect.objectContaining({ jobId: job._id }));
    });
  });

  describe('flagJob', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(svc.flagJob('x', { reason: 'r', flagType: 't' }, 'a')).rejects.toThrow(/Job not found/);
    });

    test('flags job and emits event', async () => {
      const save = jest.fn().mockResolvedValue(true);
      const job = { _id: 'j1', client: 'c1', save };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'a1', name: 'A' }) });
      const { emitJobEvent } = await import('../../../../sockets/index.js');

      const out = await svc.flagJob('j1', { reason: 'spam', flagType: 'abuse' }, 'admin1');
      expect(save).toHaveBeenCalled();
      expect(out.isFlagged).toBe(true);
      expect(emitJobEvent).toHaveBeenCalledWith('job:flagged', expect.objectContaining({ jobId: job._id }));
    });
  });

  describe('toggleFeature', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(svc.toggleFeature('x', 'a')).rejects.toThrow(/Job not found/);
    });

    test('toggles feature and emits proper event', async () => {
      const save = jest.fn().mockResolvedValue(true);
      const job = { _id: 'j1', client: 'c1', isFeatured: false, save };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'a1', name: 'A' }) });
      const { emitJobEvent } = await import('../../../../sockets/index.js');

      const out = await svc.toggleFeature('j1', 'admin1');
      expect(save).toHaveBeenCalled();
      expect(out.isFeatured).toBe(true);
      expect(emitJobEvent).toHaveBeenCalledWith('job:featured', expect.objectContaining({ jobId: job._id }));
    });
  });

  describe('deleteJob', () => {
    test('throws when not found', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(svc.deleteJob('x')).rejects.toThrow(/Job not found/);
    });

    test('throws when active proposals exist', async () => {
      const job = { _id: 'j1' };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      const Proposal = (await import('../../../../models/Proposal.js')).default;
      Proposal.countDocuments.mockResolvedValue(2);

      await expect(svc.deleteJob('j1')).rejects.toThrow(/Cannot delete job with active proposals/);
    });

    test('deletes job and related proposals when none active', async () => {
      const job = { _id: 'j1' };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      const Proposal = (await import('../../../../models/Proposal.js')).default;
      Proposal.countDocuments.mockResolvedValue(0);
      const delSpy = jest.spyOn(Job, 'findByIdAndDelete').mockResolvedValue(true);
      Proposal.deleteMany.mockResolvedValue(true);

      const out = await svc.deleteJob('j1');
      expect(delSpy).toHaveBeenCalled();
      expect(Proposal.deleteMany).toHaveBeenCalledWith({ job: 'j1' });
      expect(out).toBe(true);
    });
  });

  describe('getJobStats', () => {
    test('returns aggregated statistics', async () => {
      jest.spyOn(Job, 'countDocuments').mockResolvedValueOnce(10).mockResolvedValueOnce(4).mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      jest.spyOn(Job, 'aggregate').mockResolvedValueOnce([{ _id: 'open', count: 4 }]).mockResolvedValueOnce([{ _id: 'dev', count: 2 }]);

      const out = await svc.getJobStats();
      expect(out.total).toBe(10);
      expect(out.statusBreakdown.length).toBe(1);
      expect(out.categoryBreakdown.length).toBe(1);
      expect(out.recentJobs).toBeDefined();
    });
  });
});