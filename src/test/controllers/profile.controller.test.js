import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as ProfileController from '../../modules/profile/profile.controller.js';
import User from '../../models/User.js';

jest.mock('../../modules/profile/profile.service.js', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  updateAvatar: jest.fn(),
  addPortfolioItem: jest.fn(),
  updatePortfolioItem: jest.fn(),
  deletePortfolioItem: jest.fn(),
}));

import * as profileService from '../../modules/profile/profile.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('Profile Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('getUserProfile returns formatted user', async () => {
    const u = await User.create({ name: 'P1', email: 'p1@ex.com' });
    profileService.getProfile.mockResolvedValue(u);

    const req = { params: { userId: u._id } };
    const res = buildRes();

    await ProfileController.getUserProfile(req, res);
    expect(profileService.getProfile).toHaveBeenCalledWith(u._id);
    expect(res.payload.data.user.email).toBe('p1@ex.com');
  });

  it('uploadAvatar requires file and updates avatar', async () => {
    const u = await User.create({ name: 'P2', email: 'p2@ex.com' });
    profileService.updateAvatar.mockResolvedValue({ _id: u._id });

    const req = { user: { id: u._id }, file: { filename: 'avatar.png' } };
    const res = buildRes();

    await ProfileController.uploadAvatar(req, res);
    expect(profileService.updateAvatar).toHaveBeenCalledWith(u._id, '/uploads/avatar.png');
    expect(res.payload.data.avatarUrl).toBe('/uploads/avatar.png');
  });

  it('add/update/delete portfolio passthroughs', async () => {
    const u = await User.create({ name: 'P3', email: 'p3@ex.com' });
    profileService.addPortfolioItem.mockResolvedValue(u);
    profileService.updatePortfolioItem.mockResolvedValue(u);
    profileService.deletePortfolioItem.mockResolvedValue(u);

    let req = { user: { id: u._id }, validatedData: { title: 'X' } };
    let res = buildRes();
    await ProfileController.addPortfolio(req, res);
    expect(profileService.addPortfolioItem).toHaveBeenCalledWith(u._id, { title: 'X' });

    req = { user: { id: u._id }, params: { portfolioId: 'p1' }, validatedData: { title: 'Y' } };
    res = buildRes();
    await ProfileController.updatePortfolio(req, res);
    expect(profileService.updatePortfolioItem).toHaveBeenCalledWith(u._id, 'p1', { title: 'Y' });

    req = { user: { id: u._id }, params: { portfolioId: 'p1' } };
    res = buildRes();
    await ProfileController.deletePortfolio(req, res);
    expect(profileService.deletePortfolioItem).toHaveBeenCalledWith(u._id, 'p1');
  });
});