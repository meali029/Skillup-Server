import User from '../../../models/User.js';
import { createAppError, AppError } from '../../../core/errors/AppError.js';
import { getUserById, getFreelancers } from '../../../modules/users/user.service.js';

jest.mock('../../../models/User.js');

describe('User Service', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('getUserById', () => {
    test('throws on invalid id format', async () => {
      await expect(getUserById('bad-id')).rejects.toMatchObject({ statusCode: 400 });
    });

    test('throws when user not found', async () => {
      // findById(...).select(...) -> resolves to null
      User.findById.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
      await expect(getUserById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('returns public user data on success', async () => {
      const fakeUser = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Alice',
        email: 'a@x.com',
        avatar: 'a.jpg',
        role: 'freelancer',
        bio: 'bio',
        location: 'Lhr',
        phone: '123',
        website: 'https://x',
        languages: ['en'],
        availability: 'full',
        skills: ['js'],
        hourlyRate: 15,
        experience: '3 years',
        portfolio: [],
        appliedJobsCount: 1,
        activeProposalsCount: 0,
        completedJobsCount: 2,
        totalEarnings: 1000,
        isActive: true,
        isBanned: false,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      };

      User.findById.mockImplementation(() => ({ select: jest.fn().mockResolvedValue(fakeUser) }));

      const res = await getUserById('507f1f77bcf86cd799439011');
      expect(res).toMatchObject({ id: fakeUser._id, name: 'Alice', email: 'a@x.com' });
      expect(res).not.toHaveProperty('password');
    });
  });

  describe('getFreelancers', () => {
    function makeFindMock(returnValue = []) {
      return jest.fn().mockImplementation(() => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => returnValue
              })
            })
          })
        })
      }));
    }

    test('returns paginated freelancers with default filters', async () => {
      const sample = [{ _id: 'u1', name: 'John' }];
      User.find = makeFindMock(sample);
      User.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await getFreelancers({});

      expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ role: 'freelancer' }));
      expect(result.freelancers).toEqual(sample);
      expect(result.pagination).toMatchObject({ page: 1, limit: 10, total: 1, pages: 1 });
    });

    test('applies filters and paging correctly', async () => {
      const sample = [{ _id: 'u2', name: 'Jane' }];
      const findSpy = jest.fn().mockImplementation((q) => ({
        select: () => ({
          sort: () => ({
            skip: (s) => ({
              limit: (l) => ({
                lean: async () => sample,
              }),
            }),
          }),
        }),
      }));

      User.find = findSpy;
      User.countDocuments = jest.fn().mockResolvedValue(11);

      const filters = {
        page: '2',
        limit: '5',
        skills: ['js'],
        location: 'Garden',
        minRate: '10',
        maxRate: '50',
        experience: 'senior',
        availability: 'part-time',
        search: 'Jane'
      };

      const res = await getFreelancers(filters);

      // Verify query object passed to User.find
      const passedQuery = findSpy.mock.calls[0][0];
      expect(passedQuery.role).toBe('freelancer');
      expect(passedQuery.isActive).toBe(true);
      expect(passedQuery.skills).toEqual({ $in: ['js'] });
      expect(passedQuery.location).toEqual(expect.objectContaining({}));
      expect(passedQuery.hourlyRate.$gte).toBeCloseTo(10);
      expect(passedQuery.hourlyRate.$lte).toBeCloseTo(50);
      expect(passedQuery.experience).toBe('senior');
      expect(passedQuery.availability).toBe('part-time');
      expect(passedQuery.$or).toBeDefined();

      expect(res.freelancers).toEqual(sample);
      expect(res.pagination.page).toBe(2);
      expect(res.pagination.limit).toBe(5);
      expect(res.pagination.total).toBe(11);
      expect(res.pagination.pages).toBe(Math.ceil(11 / 5));
    });
  });
});
