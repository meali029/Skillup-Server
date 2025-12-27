import * as ProfileService from '../../../modules/profile/profile.service.js';
import User from '../../../models/User.js';

jest.mock('../../../models/User.js');

describe('Profile service', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('getProfile throws when not found', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(ProfileService.getProfile('u1')).rejects.toThrow();
  });

  test('getProfile returns user when found', async () => {
    const user = { _id: 'u1', name: 'A' };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const out = await ProfileService.getProfile('u1');
    expect(out).toEqual(user);
  });

  test('updateProfile updates allowed fields and errors when not found', async () => {
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);
    await expect(ProfileService.updateProfile('u1', { name: 'X' })).rejects.toThrow();

    const updated = { _id: 'u1', name: 'X' };
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(updated);
    const out = await ProfileService.updateProfile('u1', { name: 'X', password: 'should-be-stripped' });
    expect(out.name).toBe('X');
  });

  test('updateAvatar updates avatar and throws when user not found', async () => {
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);
    await expect(ProfileService.updateAvatar('u1', '/a.png')).rejects.toThrow();

    const updated = { _id: 'u1', avatar: '/a.png' };
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(updated);
    const out = await ProfileService.updateAvatar('u1', '/a.png');
    expect(out.avatar).toBe('/a.png');
  });

  test('addPortfolioItem enforces freelancer role and saves', async () => {
    const user = { _id: 'u1', role: 'client', portfolio: [], save: jest.fn() };
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    await expect(ProfileService.addPortfolioItem('u1', { title: 'T' })).rejects.toThrow();

    const freelancer = { _id: 'u2', role: 'freelancer', portfolio: [], save: jest.fn() };
    jest.spyOn(User, 'findById').mockResolvedValue(freelancer);
    const out = await ProfileService.addPortfolioItem('u2', { title: 'T' });
    expect(out.portfolio.length).toBe(1);
    expect(freelancer.save).toHaveBeenCalled();
  });

  test('updatePortfolioItem errors when not found and updates', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(ProfileService.updatePortfolioItem('u1', 'p1', { title: 'x' })).rejects.toThrow();

    const u = { portfolio: { id: jest.fn().mockReturnValue(null) } };
    jest.spyOn(User, 'findById').mockResolvedValue(u);
    await expect(ProfileService.updatePortfolioItem('u1', 'p1', { title: 'x' })).rejects.toThrow();

    const item = { title: 'old' };
    const u2 = { portfolio: { id: jest.fn().mockReturnValue(item) }, save: jest.fn() };
    jest.spyOn(User, 'findById').mockResolvedValue(u2);

    const out = await ProfileService.updatePortfolioItem('u1', 'p1', { title: 'new' });
    expect(out).toBe(u2);
    expect(item.title).toBe('new');
    expect(u2.save).toHaveBeenCalled();
  });

  test('deletePortfolioItem removes item', async () => {
    jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(ProfileService.deletePortfolioItem('u1', 'p1')).rejects.toThrow();

    const u = { portfolio: { pull: jest.fn() }, save: jest.fn() };
    jest.spyOn(User, 'findById').mockResolvedValue(u);
    const out = await ProfileService.deletePortfolioItem('u1', 'p1');
    expect(u.portfolio.pull).toHaveBeenCalledWith('p1');
    expect(u.save).toHaveBeenCalled();
    expect(out).toBe(u);
  });

  test('getFreelancerProfile checks role and returns mapped object', async () => {
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
    await expect(ProfileService.getFreelancerProfile('u1')).rejects.toThrow();

    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ _id: 'u1', role: 'client' }) }));
    await expect(ProfileService.getFreelancerProfile('u1')).rejects.toThrow();

    const user = { _id: 'u1', role: 'freelancer', name: 'F', email: 'e', avatar: '/a', bio: 'b', location: 'L', phone: 'p', skills: ['s'], hourlyRate: 10, experience: 'expert', portfolio: [], isProfileComplete: true };
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(user) }));
    const out = await ProfileService.getFreelancerProfile('u1');
    expect(out).toHaveProperty('name', 'F');
    expect(out).toHaveProperty('skills');
  });
});
