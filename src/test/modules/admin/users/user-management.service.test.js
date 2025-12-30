import * as svc from '../../../../modules/admin/users/user-management.service.js';
import User from '../../../../models/User.js';
import Job from '../../../../models/Job.js';
import Proposal from '../../../../models/Proposal.js';
import { notifyUser } from '../../../../modules/notifications/notification.service.js';
import ExcelJS from 'exceljs';

jest.mock('../../../../models/User.js');
jest.mock('../../../../models/Job.js');
jest.mock('../../../../models/Proposal.js');
jest.mock('../../../../modules/notifications/notification.service.js');

// Mock ExcelJS Workbook
jest.mock('exceljs', () => {
  return {
    Workbook: jest.fn().mockImplementation(() => ({
      addWorksheet: jest.fn().mockReturnThis(),
      columns: null,
      getRow: jest.fn().mockReturnValue({ font: {}, fill: {} }),
      addRow: jest.fn(),
      xlsx: { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('xlsx')) }
    }))
  };
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('user-management.service', () => {
  describe('getAllUsers', () => {
    test('returns users and pagination', async () => {
      const fakeUsers = [{ _id: 'u1' }];
      // mock chainable find().select().sort().skip().limit().lean()
      User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(fakeUsers) });
      User.countDocuments.mockResolvedValue(1);

      const res = await svc.getAllUsers({ page: 1, limit: 10 });
      expect(res.users).toEqual(fakeUsers);
      expect(res.pagination.total).toBe(1);
    });

    test('applies search and date filters', async () => {
      User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
      User.countDocuments.mockResolvedValue(0);

      const res = await svc.getAllUsers({ search: 'john', startDate: '2020-01-01', endDate: '2020-02-01' });
      expect(res.pagination.total).toBe(0);
    });
  });

  describe('getUserById', () => {
    test('throws when not found', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
      await expect(svc.getUserById('no')).rejects.toThrow(/User not found/);
    });

    test('returns freelancer stats', async () => {
      const user = { _id: 'u1', role: 'freelancer' };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(user) });
      Proposal.countDocuments = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(5);

      const res = await svc.getUserById('u1');
      expect(res.stats.totalProposals).toBe(10);
      expect(res.stats.completedJobs).toBe(5);
      expect(res.stats.successRate).toBeDefined();
    });

    test('returns client stats', async () => {
      const user = { _id: 'u2', role: 'client' };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(user) });
      Job.countDocuments = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      const res = await svc.getUserById('u2');
      expect(res.stats.totalJobs).toBe(3);
      expect(res.stats.activeJobs).toBe(1);
      expect(res.stats.completedJobs).toBe(2);
    });
  });

  describe('suspendUser / banUser / activateUser', () => {
    test('suspendUser throws when not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(svc.suspendUser('no', 'r', 'a')).rejects.toThrow(/User not found/);
    });

    test('suspendUser throws when admin', async () => {
      const admin = { role: 'admin' };
      User.findById.mockResolvedValue(admin);
      await expect(svc.suspendUser('a', 'r', 'ad')).rejects.toThrow(/Cannot suspend admin users/);
    });

    test('suspendUser for client closes jobs and returns updated user', async () => {
      const user = { _id: 'u3', role: 'client', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValueOnce(user).mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: 'u3', isActive: false }) });
      Job.updateMany = jest.fn().mockResolvedValue(true);
      Proposal.updateMany = jest.fn().mockResolvedValue(true);
      notifyUser.mockRejectedValue(new Error('notify fail'));

      const res = await svc.suspendUser('u3', 'reason', 'admin1');
      expect(Job.updateMany).toHaveBeenCalled();
      expect(res._id).toBe('u3');
    });

    test('banUser throws when admin', async () => {
      const admin = { role: 'admin' };
      User.findById.mockResolvedValue(admin);
      await expect(svc.banUser('a', 'r', 'ad')).rejects.toThrow(/Cannot ban admin users/);
    });

    test('banUser for freelancer withdraws proposals and returns updated user', async () => {
      const user = { _id: 'u4', role: 'freelancer', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValueOnce(user).mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: 'u4', isBanned: true }) });
      Proposal.updateMany = jest.fn().mockResolvedValue(true);
      const res = await svc.banUser('u4', 'br', 'admin');
      expect(Proposal.updateMany).toHaveBeenCalled();
      expect(res._id).toBe('u4');
    });

    test('activateUser reopens jobs and reactivates proposals and returns user', async () => {
      const user = { _id: 'u5', role: 'client', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValueOnce(user).mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: 'u5', isActive: true }) });
      Job.updateMany = jest.fn().mockResolvedValue(true);
      Proposal.updateMany = jest.fn().mockResolvedValue(true);
      notifyUser.mockResolvedValue(true);

      const res = await svc.activateUser('u5', 'admin');
      expect(Job.updateMany).toHaveBeenCalled();
      expect(res._id).toBe('u5');
    });
  });

  describe('getUserActivity', () => {
    test('throws when user not found', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
      await expect(svc.getUserActivity('no')).rejects.toThrow(/User not found/);
    });

    test('returns recent proposals for freelancer', async () => {
      const user = { _id: 'u6', role: 'freelancer' };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(user) });
      // mock chainable Proposal.find().populate().sort().limit().lean()
      Proposal.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: 'p1', job: { title: 'Job1' } }]) });

      const res = await svc.getUserActivity('u6');
      expect(res.recentProposals.length).toBe(1);
      expect(res.recentProposals[0].job.title).toBe('Job1');
    });

    test('returns recent jobs for client', async () => {
      const user = { _id: 'u7', role: 'client' };
      User.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(user) });
      Job.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: 'j1' }]) });

      const res = await svc.getUserActivity('u7');
      expect(res.recentJobs.length).toBe(1);
    });
  });

  describe('exportUsers', () => {
    test('returns csv buffer when format csv', async () => {
      const users = [{ name: 'A', email: 'a@b', role: 'client', isBanned: false, isActive: true, isEmailVerified: false, location: '', phone: '', createdAt: Date.now() }];
      User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(users) });

      const buf = await svc.exportUsers({}, 'csv');
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.toString()).toContain('Name');
    });

    test('returns excel buffer for excel format', async () => {
      const users = [{ name: 'B', email: 'b@b', role: 'client', isBanned: false, isActive: true, isEmailVerified: false, location: '', phone: '', createdAt: Date.now() }];
      User.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(users) });

      // Ensure Workbook mock returns an object with addWorksheet and writeBuffer
      ExcelJS.Workbook.mockImplementationOnce(() => ({
        addWorksheet: jest.fn().mockReturnValue({
          columns: null,
          getRow: jest.fn().mockReturnValue({ font: {}, fill: {} }),
          addRow: jest.fn()
        }),
        xlsx: { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('xlsx')) }
      }));

      const buf = await svc.exportUsers({}, 'excel');
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.toString()).toBe('xlsx');
    });
  });
});