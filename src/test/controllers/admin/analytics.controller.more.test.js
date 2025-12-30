import * as controller from '../../../modules/admin/analytics/analytics.controller.js';
import analyticsService from '../../../modules/admin/analytics/analytics.service.js';

jest.mock('../../../modules/admin/analytics/analytics.service.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

beforeEach(() => jest.resetAllMocks());

describe('analytics.controller - extra', () => {
  test('getUserGrowthReport returns data', async () => {
    const data = [{ _id: {}, total: 1 }];
    analyticsService.getUserGrowthReport.mockResolvedValue(data);

    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.getUserGrowthReport(req, res, next);

    expect(analyticsService.getUserGrowthReport).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('getRevenueReport returns data', async () => {
    analyticsService.getRevenueReport.mockResolvedValue([{}]);
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.getRevenueReport(req, res, next);
    expect(analyticsService.getRevenueReport).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('getCategoryDistribution returns data', async () => {
    analyticsService.getJobCategoryDistribution.mockResolvedValue([{}]);
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await controller.getCategoryDistribution(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('getFlaggedJobsReport handles query dates and returns data', async () => {
    analyticsService.getFlaggedJobsReport.mockResolvedValue([{ title: 't' }]);
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.getFlaggedJobsReport(req, res, next);
    expect(analyticsService.getFlaggedJobsReport).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('export endpoints forward errors to next', async () => {
    analyticsService.getDetailedAnalytics.mockRejectedValue(new Error('boom'));
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.exportToPDF(req, res, next);
    await controller.exportToExcel(req, res, next);
    await controller.exportToCSV(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
  });
});