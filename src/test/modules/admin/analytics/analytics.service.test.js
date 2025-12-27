import AnalyticsService from '../../../../modules/admin/analytics/analytics.service.js';
import User from '../../../../models/User.js';
import Job from '../../../../models/Job.js';

jest.mock('../../../../models/User.js');
jest.mock('../../../../models/Job.js');

beforeEach(() => jest.resetAllMocks());

describe('AnalyticsService', () => {
  test('getTotalRevenue returns aggregated result or default', async () => {
    Job.aggregate = jest.fn().mockResolvedValue([{ total: 1000, count: 2 }]);
    const res = await AnalyticsService.getTotalRevenue();
    expect(res.total).toBe(1000);

    Job.aggregate = jest.fn().mockResolvedValue([]);
    const res2 = await AnalyticsService.getTotalRevenue();
    expect(res2).toEqual({ total: 0, count: 0 });
  });

  test('getPlatformFees returns aggregated result', async () => {
    Job.aggregate = jest.fn().mockResolvedValue([{ total: 100, count: 1 }]);
    const out = await AnalyticsService.getPlatformFees();
    expect(out.total).toBe(100);
  });

  test('getActiveUsers calls countDocuments sequence', async () => {
    User.countDocuments = jest.fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(200);

    const out = await AnalyticsService.getActiveUsers();
    expect(out.daily).toBe(5);
    expect(out.total).toBe(200);
  });

  test('getJobStats calculates completionRate and avgValue', async () => {
    Job.countDocuments = jest.fn()
      .mockResolvedValueOnce(100) // posted
      .mockResolvedValueOnce(80)  // completed
      .mockResolvedValueOnce(10)  // in-progress
      .mockResolvedValueOnce(5);  // cancelled

    AnalyticsService.getAverageJobValue = jest.fn().mockResolvedValue(500);

    const out = await AnalyticsService.getJobStats();
    expect(out.posted).toBe(100);
    expect(Number(out.completionRate)).toBeCloseTo((80 / 100) * 100);
    expect(out.avgValue).toBe(500);
  });

  test('getFlaggedJobsReport uses find with chain', async () => {
    const jobs = [{ _id: 'j1' }];
    Job.find = jest.fn().mockReturnValue({ populate: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(jobs) });

    const res = await AnalyticsService.getFlaggedJobsReport(new Date(0), new Date());
    expect(res).toBe(jobs);
  });

  test('getDetailedAnalytics composes data', async () => {
    // Spy on methods
    jest.spyOn(AnalyticsService, 'getDashboardMetrics').mockResolvedValue({ totalRevenue: 1 });
    jest.spyOn(AnalyticsService, 'getUserGrowthReport').mockResolvedValue([{ _id: {}, total: 1 }]);
    jest.spyOn(AnalyticsService, 'getRevenueReport').mockResolvedValue([]);
    jest.spyOn(AnalyticsService, 'getJobCategoryDistribution').mockResolvedValue([]);
    jest.spyOn(AnalyticsService, 'getFlaggedJobsReport').mockResolvedValue([]);

    const out = await AnalyticsService.getDetailedAnalytics(new Date(0), new Date());
    expect(out.metrics.totalRevenue).toBe(1);
    expect(out.generatedAt).toBeDefined();
    expect(out.period.start).toBeInstanceOf(Date);
  });
});