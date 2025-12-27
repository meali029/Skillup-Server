import * as ProposalService from '../../../modules/proposals/proposal.service.js';
import Proposal from '../../../models/Proposal.js';
import Job from '../../../models/Job.js';
import User from '../../../models/User.js';
import Conversation from '../../../models/Conversation.js';
import Message from '../../../models/Message.js';
import { notifyUser } from '../../../modules/notifications/notification.service.js';
import aiService from '../../../services/ai/ai.service.js';

jest.mock('../../../models/Proposal.js');
jest.mock('../../../models/Job.js');
jest.mock('../../../models/User.js');
jest.mock('../../../models/Conversation.js');
jest.mock('../../../models/Message.js');
jest.mock('../../../modules/notifications/notification.service.js');
jest.mock('../../../services/ai/ai.service.js');

describe('Proposal Service', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('createProposal', () => {
    test('throws if user not found', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue(null);

      await expect(ProposalService.createProposal('u1', { jobId: 'j1' })).rejects.toThrow('User not found');
    });

    test('throws if user role not freelancer', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'client' });

      await expect(ProposalService.createProposal('u1', { jobId: 'j1' })).rejects.toThrow();
    });

    test('throws if job not found', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer', name: 'F' });
      jest.spyOn(Job, 'findById').mockResolvedValue(null);

      await expect(ProposalService.createProposal('u1', { jobId: 'j1' })).rejects.toThrow('Job not found');
    });

    test('blocks when existing active proposal exists', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer', name: 'F' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true });
      jest.spyOn(Proposal, 'findOne').mockResolvedValue({ status: 'pending' });

      await expect(ProposalService.createProposal('u1', { jobId: 'j1' })).rejects.toThrow();
    });

    test('allows resubmission when withdrawn proposal exists and deletes it', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer', name: 'F' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true });
      const existing = { _id: 'pold', status: 'withdrawn' };
      jest.spyOn(Proposal, 'findOne').mockResolvedValue(existing);
      const delSpy = jest.spyOn(Proposal, 'findByIdAndDelete').mockResolvedValue(true);

      // Create path: create and subsequent findById
      const created = { _id: 'pnew' };
      jest.spyOn(Proposal, 'create').mockResolvedValue(created);
      const populated = { _id: 'pnew', jobId: 'j1' };
      // mock chainable populate calls
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue(populated)
        }))
      }));
      jest.spyOn(Job, 'findByIdAndUpdate').mockResolvedValue(true);
      // notify mocked module
      const notif = require('../../../modules/notifications/notification.service.js');
      jest.spyOn(notif, 'notifyUser').mockImplementation(() => Promise.resolve());

      const res = await ProposalService.createProposal('u1', { jobId: 'j1', coverLetter: 'x'.repeat(100), bidAmount: 1000, deliveryTime: 7 });
      expect(delSpy).toHaveBeenCalledWith('pold');
      expect(res).toEqual(populated);
    });

    test('respects job budget min/max checks', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer', name: 'F' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true, budgetMin: 1000, budgetMax: 2000 });

      await expect(ProposalService.createProposal('u1', { jobId: 'j1', bidAmount: 500, coverLetter: 'x'.repeat(100), deliveryTime: 7 })).rejects.toThrow();
      await expect(ProposalService.createProposal('u1', { jobId: 'j1', bidAmount: 3000, coverLetter: 'x'.repeat(100), deliveryTime: 7 })).rejects.toThrow();
    });

    test('successful create notifies client and handles notification error gracefully', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer', name: 'Freelancer Name' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true, client: 'c1', title: 'Title' });
      jest.spyOn(Proposal, 'findOne').mockResolvedValue(null);
      const created = { _id: 'p1' };
      jest.spyOn(Proposal, 'create').mockResolvedValue(created);
      const populated = { _id: 'p1', jobId: { title: 'Title' } };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue(populated)
        }))
      }));
      jest.spyOn(Job, 'findByIdAndUpdate').mockResolvedValue(true);

      // Make notifyUser throw to exercise catch branch
      const notif = require('../../../modules/notifications/notification.service.js');
      jest.spyOn(notif, 'notifyUser').mockRejectedValue(new Error('boom'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await ProposalService.createProposal('u1', { jobId: 'j1', coverLetter: 'x'.repeat(100), bidAmount: 1500, deliveryTime: 10 });
      expect(res).toEqual(populated);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('generateProposalDraft', () => {
    test('returns draft on success', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true, title: 'T' });
      jest.spyOn(Proposal, 'findOne').mockResolvedValue(null);

      jest.spyOn(aiService, 'generateProposalDraft').mockResolvedValue({ coverLetter: 'CL', bidAmount: 1200, deliveryTime: 7, confidence: 0.9, generatedAt: new Date() });

      const out = await ProposalService.generateProposalDraft('j1', 'u1');
      expect(out).toHaveProperty('draft');
      expect(out.draft.coverLetter).toBe('CL');
    });

    test('rethrows AI provider errors or wraps generic errors', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true });
      jest.spyOn(Proposal, 'findOne').mockResolvedValue(null);

      // provider-specific error with statusCode should be rethrown
      const providerErr = new Error('Provider fail');
      providerErr.statusCode = 502;
      jest.spyOn(aiService, 'generateProposalDraft').mockRejectedValue(providerErr);
      await expect(ProposalService.generateProposalDraft('j1', 'u1')).rejects.toBe(providerErr);

      // generic error should be wrapped to a 500 AppError
      jest.spyOn(aiService, 'generateProposalDraft').mockRejectedValue(new Error('Generic fail'));
      await expect(ProposalService.generateProposalDraft('j1', 'u1')).rejects.toThrow();
    });
  });

  describe('hasApplied & getProposalStats', () => {
    test('hasApplied returns false when none', async () => {
      jest.spyOn(Proposal, 'findOne').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
      const out = await ProposalService.hasApplied('u1', 'j1');
      expect(out.hasApplied).toBe(false);
    });

    test('hasApplied handles withdrawn', async () => {
      jest.spyOn(Proposal, 'findOne').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ _id: 'p1', status: 'withdrawn' }) }));
      const out = await ProposalService.hasApplied('u1', 'j1');
      expect(out.hasApplied).toBe(false);
    });

    test('hasApplied returns proposal summary when applied', async () => {
      jest.spyOn(Proposal, 'findOne').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ _id: 'p1', status: 'pending', createdAt: 't' }) }));
      const out = await ProposalService.hasApplied('u1', 'j1');
      expect(out.hasApplied).toBe(true);
      expect(out.proposal.id).toBe('p1');
    });

    test('getProposalStats computes success rate', async () => {
      jest.spyOn(Proposal, 'countDocuments')
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4)  // pending
        .mockResolvedValueOnce(3)  // accepted
        .mockResolvedValueOnce(2)  // rejected
        .mockResolvedValueOnce(1); // withdrawn

      const stats = await ProposalService.getProposalStats('u1');
      expect(stats.total).toBe(10);
      expect(stats.successRate).toBeCloseTo((3 / 10) * 100);
    });
  });

  describe('other proposal service methods', () => {
    test('getProposalById throws when not found', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }))
      }));
      await expect(ProposalService.getProposalById('p1', 'u1')).rejects.toThrow('Proposal not found');
    });

    test('getProposalById throws when not owner', async () => {
      const prop = { freelancerId: { _id: 'u2' } };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop) }))
      }));
      await expect(ProposalService.getProposalById('p1', 'u1')).rejects.toThrow();
    });

    test('getProposalById throws when freelancer inactive/banned', async () => {
      const prop = { freelancerId: { _id: 'u1', isActive: false, isBanned: false } };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop) }))
      }));
      await expect(ProposalService.getProposalById('p1', 'u1')).rejects.toThrow();
    });

    test('getFreelancerProposals returns paginated data', async () => {
      const fake = [{ _id: 'p1' }];
      jest.spyOn(Proposal, 'find').mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(fake)
      }));
      jest.spyOn(Proposal, 'countDocuments').mockResolvedValue(1);

      const res = await ProposalService.getFreelancerProposals('u1', { page: 1, limit: 10 });
      expect(res.proposals).toEqual(fake);
      expect(res.pagination.total).toBe(1);
    });

    test('updateProposal throws when not found', async () => {
      jest.spyOn(Proposal, 'findById').mockResolvedValue(null);
      await expect(ProposalService.updateProposal('p1', 'u1', { coverLetter: 'x' })).rejects.toThrow('Proposal not found');
    });

    test('updateProposal throws when user is not the owner', async () => {
      const p = { freelancerId: { toString: () => 'u2' }, status: 'pending' };
      jest.spyOn(Proposal, 'findById').mockResolvedValue(p);
      await expect(ProposalService.updateProposal('p1', 'u1', { coverLetter: 'x' })).rejects.toThrow();
    });

    test('updateProposal throws when status is not pending', async () => {
      const p = { freelancerId: { toString: () => 'u1' }, status: 'accepted' };
      jest.spyOn(Proposal, 'findById').mockResolvedValue(p);
      await expect(ProposalService.updateProposal('p1', 'u1', { coverLetter: 'x' })).rejects.toThrow();
    });

    test('updateProposal updates and returns populated proposal on success', async () => {
      const pending = { freelancerId: { toString: () => 'u1' }, status: 'pending', save: jest.fn(), _id: 'p1' };
      const findSpy = jest.spyOn(Proposal, 'findById');
      findSpy.mockResolvedValueOnce(pending);
      findSpy.mockImplementationOnce(() => ({
        populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue({ _id: 'p1' }) }))
      }));

      const out = await ProposalService.updateProposal('p1', 'u1', { coverLetter: 'y' });
      expect(out._id).toBe('p1');
    });

    test('withdrawProposal handles checks and updates', async () => {
      jest.spyOn(Proposal, 'findById').mockResolvedValue(null);
      await expect(ProposalService.withdrawProposal('p1', 'u1')).rejects.toThrow('Proposal not found');

      const p = { freelancerId: 'u2', status: 'pending' };
      jest.spyOn(Proposal, 'findById').mockResolvedValue(p);
      await expect(ProposalService.withdrawProposal('p1', 'u1')).rejects.toThrow();

      p.freelancerId = 'u1';
      p.status = 'accepted';
      jest.spyOn(Proposal, 'findById').mockResolvedValue(p);
      await expect(ProposalService.withdrawProposal('p1', 'u1')).rejects.toThrow();

      const toWithdraw = { freelancerId: 'u1', status: 'pending', save: jest.fn(), jobId: 'j1' };
      jest.spyOn(Proposal, 'findById').mockResolvedValue(toWithdraw);
      const updateSpy = jest.spyOn(Job, 'findByIdAndUpdate').mockResolvedValue(true);

      const res = await ProposalService.withdrawProposal('p1', 'u1');
      expect(res.message).toMatch(/withdrawn/i);
      expect(updateSpy).toHaveBeenCalled();
    });

    test('getJobProposals handles job not found and permission denial, filters banned users', async () => {
      jest.spyOn(Job, 'findById').mockResolvedValue(null);
      await expect(ProposalService.getJobProposals('j1', 'c1')).rejects.toThrow('Job not found');

      const job = { _id: 'j1', client: 'c2' };
      jest.spyOn(Job, 'findById').mockResolvedValue(job);
      await expect(ProposalService.getJobProposals('j1', 'c1')).rejects.toThrow();

      const job2 = { _id: 'j1', client: 'c1' };
      jest.spyOn(Job, 'findById').mockResolvedValue(job2);
      const proposals = [ { freelancerId: { isActive: true, isBanned: false } }, { freelancerId: { isActive: false, isBanned: false } } ];
      jest.spyOn(Proposal, 'find').mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(proposals)
      }));
      jest.spyOn(Proposal, 'countDocuments').mockResolvedValue(2);

      const out = await ProposalService.getJobProposals('j1', 'c1');
      expect(out.proposals.length).toBe(1);
    });

    test('getClientProposalById checks not found and permission', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) })) }));
      await expect(ProposalService.getClientProposalById('p1', 'c1')).rejects.toThrow('Proposal not found');

      const prop = { jobId: { client: 'c2' } };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop) }));
      await expect(ProposalService.getClientProposalById('p1', 'c1')).rejects.toThrow();

      const prop2 = { jobId: { client: 'c1' } };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop2) }))
      }));
      const out = await ProposalService.getClientProposalById('p1', 'c1');
      expect(out).toEqual(prop2);
    });

    test('clientViewedProposalAndNotify handles not found, already viewed, notify errors', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }));
      await expect(ProposalService.clientViewedProposalAndNotify('p1', 'c1')).rejects.toThrow('Proposal not found');

      const prop = { clientViewed: true };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop) }));
      const out1 = await ProposalService.clientViewedProposalAndNotify('p1', 'c1');
      expect(out1).toEqual(prop);

      const prop2 = { clientViewed: false, freelancerId: 'f1', jobId: { title: 'T' }, save: jest.fn() };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop2) }));
      const notif = require('../../../modules/notifications/notification.service.js');
      jest.spyOn(notif, 'notifyUser').mockRejectedValue(new Error('boom'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const out2 = await ProposalService.clientViewedProposalAndNotify('p1', 'c1');
      expect(out2).toEqual(prop2);
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('acceptProposal throws when not found', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }));
      await expect(ProposalService.acceptProposal('p1', 'c1')).rejects.toThrow('Proposal not found');
    });

    test('acceptProposal throws when not pending', async () => {
      const prop2 = { jobId: { client: 'c1' }, status: 'accepted' };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop2) }));
      await expect(ProposalService.acceptProposal('p1', 'c1')).rejects.toThrow();
    });

    test('acceptProposal success path creates conversation and notifies', async () => {
      const p = { jobId: { client: { toString: () => 'c1' }, _id: 'j1', title: 'T' }, status: 'pending', freelancerId: 'f1', bidAmount: 100, save: jest.fn().mockResolvedValue(true) };
      const findSpy = jest.spyOn(Proposal, 'findById');
      findSpy.mockImplementationOnce(() => ({ populate: jest.fn().mockResolvedValue(p) }));
      findSpy.mockImplementationOnce(() => ({ populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(p) })) })) }));

      jest.spyOn(Conversation, 'create').mockResolvedValue({ _id: 'c1', populate: jest.fn(), save: jest.fn().mockResolvedValue(true) });
      jest.spyOn(Message, 'create').mockResolvedValue({ _id: 'm1' });
      jest.spyOn(Proposal, 'updateMany').mockResolvedValue(true);
      const notif = require('../../../modules/notifications/notification.service.js');
      jest.spyOn(notif, 'notifyUser').mockRejectedValue(new Error('boom'));

      const out = await ProposalService.acceptProposal('p1', 'c1');
      expect(out.proposal).toBeDefined();
    });

    test('rejectProposal throws when not found', async () => {
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(null) }));
      await expect(ProposalService.rejectProposal('p1', 'c1')).rejects.toThrow();
    });

    test('rejectProposal throws when has wrong status', async () => {
      const prop2 = { jobId: { client: 'c1' }, status: 'accepted' };
      jest.spyOn(Proposal, 'findById').mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(prop2) }));
      await expect(ProposalService.rejectProposal('p1', 'c1')).rejects.toThrow();
    });

    test('rejectProposal sets reason and handles notification errors', async () => {
      const p = { jobId: { client: 'c1', title: 'T' }, status: 'pending', freelancerId: 'f1', save: jest.fn(), _id: 'p1' };
      const findSpy = jest.spyOn(Proposal, 'findById');
      findSpy.mockImplementationOnce(() => ({ populate: jest.fn().mockResolvedValue(p) }));
      findSpy.mockImplementationOnce(() => ({ populate: jest.fn().mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(p) })) }));
      const notif = require('../../../modules/notifications/notification.service.js');
      jest.spyOn(notif, 'notifyUser').mockRejectedValue(new Error('boom'));

      const out = await ProposalService.rejectProposal('p1', 'c1', 'not a fit');
      expect(out.jobId.title).toBe('T');
    });

    test('getAllClientProposals returns proposals, stats and pagination', async () => {
      const clientJobs = [{ _id: 'j1' }, { _id: 'j2' }];
      jest.spyOn(Job, 'find').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(clientJobs) }));
      const proposals = [{ _id: 'p1' }];
      jest.spyOn(Proposal, 'find').mockImplementation(() => ({
        populate: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue(proposals)
        })),
      }));
      jest.spyOn(Proposal, 'countDocuments').mockResolvedValue(1);

      const out = await ProposalService.getAllClientProposals('c1');
      expect(out.stats.total).toBeDefined();
    });

    test('regenerateProposalDraft delegates to generateProposalDraft', async () => {
      // Setup so generateProposalDraft would succeed
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1', role: 'freelancer' });
      jest.spyOn(Job, 'findById').mockResolvedValue({ _id: 'j1', status: 'open', isActive: true, title: 'T' });
      jest.spyOn(Proposal, 'findOne').mockResolvedValue(null);
      jest.spyOn(aiService, 'generateProposalDraft').mockResolvedValue({ coverLetter: 'CL', bidAmount: 1200, deliveryTime: 7, confidence: 0.9, generatedAt: new Date() });

      const out = await ProposalService.regenerateProposalDraft('j1', 'u1');
      expect(out.draft).toBeDefined();
    });
  });
});
