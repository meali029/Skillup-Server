import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as UserController from '../../modules/users/user.controller.js';
import User from '../../models/User.js';

// Mock user service
jest.mock('../../modules/users/user.service.js', () => ({
  getFreelancerById: jest.fn(),
  getUserById: jest.fn(),
  getFreelancers: jest.fn(),
}));

import * as userService from '../../modules/users/user.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('User Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('getFreelancerById returns freelancer', async () => {
    const f = await User.create({ name: 'F', email: 'f@ex.com', role: 'freelancer' });
    userService.getFreelancerById.mockResolvedValue(f);

    const req = { params: { id: f._id } };
    const res = buildRes();

    await UserController.getFreelancerById(req, res);
    expect(userService.getFreelancerById).toHaveBeenCalledWith(f._id);
    expect(res.payload.data.freelancer._id.toString()).toBe(f._id.toString());
  });

  it('getUserById returns user', async () => {
    const u = await User.create({ name: 'U', email: 'u@ex.com' });
    userService.getUserById.mockResolvedValue(u);

    const req = { params: { id: u._id } };
    const res = buildRes();

    await UserController.getUserById(req, res);
    expect(userService.getUserById).toHaveBeenCalledWith(u._id);
  });

  it('getFreelancers forwards query and returns pagination', async () => {
    userService.getFreelancers.mockResolvedValue({ freelancers: [{ _id: 'f1' }], pagination: { page:1, limit:10, total:1 } });
    const req = { query: { page: '1', limit: '10', skills: 'js,node' } };
    const res = buildRes();

    await UserController.getFreelancers(req, res);
    expect(userService.getFreelancers).toHaveBeenCalledWith(expect.objectContaining({ page: '1', limit: '10', skills: expect.any(Array) }));
    expect(res.payload).toBeDefined();
  });
});