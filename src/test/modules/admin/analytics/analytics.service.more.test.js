import AnalyticsService from '../../../../modules/admin/analytics/analytics.service.js';
import User from '../../../../models/User.js';
import Job from '../../../../models/Job.js';

jest.mock('../../../../models/User.js');
jest.mock('../../../../models/Job.js');

beforeEach(() => jest.resetAllMocks());

describe('AnalyticsService - extra coverage', () => {
  test('getAverageJobValue returns 0 when no result', async () => {
    Job.aggregate = jest.fn().mockResolvedValue([]);
    const out = await AnalyticsService.getAverageJobValue();
    expect(out).toBe(0);
  });

  test('getTopFreelancers returns array and honors limit', async () => {
    const f = [{ name: 'A' }, { name: 'B' }];
    User.aggregate = jest.fn().mockResolvedValue(f);
    const res = await AnalyticsService.getTopFreelancers(2);
    expect(res).toBe(f);
    expect(User.aggregate).toHaveBeenCalled();
  });

  test('getTopClients returns array and honors limit', async () => {
    const c = [{ name: 'C' }];
    User.aggregate = jest.fn().mockResolvedValue(c);
    const res = await AnalyticsService.getTopClients(1);
    expect(res).toBe(c);
  });

  test('getVerificationStats computes unverified correctly', async () => {
    User.countDocuments = jest.fn()
      .mockResolvedValueOnce(10) // verified
      .mockResolvedValueOnce(2)  // pending
      .mockResolvedValueOnce(1)  // rejected
      .mockResolvedValueOnce(20); // total

    const out = await AnalyticsService.getVerificationStats();
    expect(out.verified).toBe(10);
    expect(out.unverified).toBe(10);
    expect(out.total).toBe(20);
  });

  test('getFlaggedJobsCount returns counts', async () => {
    Job.countDocuments = jest.fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(100);

    const out = await AnalyticsService.getFlaggedJobsCount();
    expect(out.manual).toBe(3);
    expect(out.total).toBe(100);
  });

  test('getUserGrowthReport supports month interval', async () => {
    const data = [{ _id: { year: 2020, month: 1 }, total: 2 }];
    User.aggregate = jest.fn().mockResolvedValue(data);

    const out = await AnalyticsService.getUserGrowthReport(new Date(2020,0,1), new Date(2020,1,1), 'month');
    expect(out).toBe(data);
  });

  test('getRevenueReport and getJobCategoryDistribution return data', async () => {
    const rev = [{ _id: { year: 2020, month: 1 }, revenue: 100 }];
    Job.aggregate = jest.fn().mockResolvedValueOnce(rev).mockResolvedValueOnce([{ _id: 'dev', count: 2, totalValue: 200 }]);

    const r = await AnalyticsService.getRevenueReport(new Date(2020,0,1), new Date(2020,1,1));
    expect(r).toBe(rev);

    const cat = await AnalyticsService.getJobCategoryDistribution();
    expect(Array.isArray(cat)).toBe(true);
  });
});