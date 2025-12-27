import * as controller from '../../../modules/admin/analytics/analytics.controller.js';
import analyticsService from '../../../modules/admin/analytics/analytics.service.js';
import exportService from '../../../modules/admin/analytics/export.service.js';

jest.mock('../../../modules/admin/analytics/analytics.service.js');
jest.mock('../../../modules/admin/analytics/export.service.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

beforeEach(() => jest.resetAllMocks());

describe('analytics.controller', () => {
  test('getDashboardMetrics returns metrics', async () => {
    const metrics = { totalRevenue: 1 };
    analyticsService.getDashboardMetrics.mockResolvedValue(metrics);

    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await controller.getDashboardMetrics(req, res, next);
    expect(analyticsService.getDashboardMetrics).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: metrics }));
  });

  test('endpoints forward errors to next', async () => {
    analyticsService.getDashboardMetrics.mockRejectedValue(new Error('err'));
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await controller.getDashboardMetrics(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('exportToPDF sets headers and sends buffer', async () => {
    const analytics = { metrics: {} };
    analyticsService.getDetailedAnalytics.mockResolvedValue(analytics);
    const buf = Buffer.from('pdf');
    exportService.generatePDF.mockResolvedValue(buf);

    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.exportToPDF(req, res, next);

    expect(exportService.generatePDF).toHaveBeenCalledWith(analytics);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.send).toHaveBeenCalledWith(buf);
  });

  test('exportToExcel sets headers and sends buffer', async () => {
    const analytics = { metrics: {} };
    analyticsService.getDetailedAnalytics.mockResolvedValue(analytics);
    const buf = Buffer.from('xlsx');
    exportService.generateExcel.mockResolvedValue(buf);

    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.exportToExcel(req, res, next);

    expect(exportService.generateExcel).toHaveBeenCalledWith(analytics);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.send).toHaveBeenCalledWith(buf);
  });

  test('exportToCSV sets headers and sends csv', async () => {
    const analytics = { metrics: {}, revenue: [], categories: [] };
    analyticsService.getDetailedAnalytics.mockResolvedValue(analytics);
    exportService.generateCSV.mockResolvedValue('a,b,c');

    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    await controller.exportToCSV(req, res, next);

    expect(exportService.generateCSV).toHaveBeenCalledWith(analytics);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send).toHaveBeenCalledWith('a,b,c');
  });
});