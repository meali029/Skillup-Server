// Mock cron and nodemailer before importing the module under test
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransporter: jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue(true) }) }));

import ScheduledReportsService from '../../../../modules/admin/analytics/scheduled-reports.service.js';
import analyticsService from '../../../../modules/admin/analytics/analytics.service.js';
import exportService from '../../../../modules/admin/analytics/export.service.js';
import User from '../../../../models/User.js';

jest.mock('../../../../modules/admin/analytics/analytics.service.js');
jest.mock('../../../../modules/admin/analytics/export.service.js');
jest.mock('../../../../models/User.js');

beforeEach(() => jest.resetAllMocks());

describe('ScheduledReportsService', () => {
  test('sendWeeklyReport sends pdf to admins', async () => {
    const pdfBuf = Buffer.from('pdf');
    analyticsService.getDetailedAnalytics.mockResolvedValue({});
    exportService.generatePDF.mockResolvedValue(pdfBuf);
    User.find = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([{ email: 'a@b', name: 'A' }]) });

    await ScheduledReportsService.sendWeeklyReport();

    expect(analyticsService.getDetailedAnalytics).toHaveBeenCalled();
    expect(exportService.generatePDF).toHaveBeenCalled();
    expect(User.find).toHaveBeenCalledWith({ role: 'admin', isActive: true });
  });

  test('sendMonthlyReport sends pdf and excel', async () => {
    const pdfBuf = Buffer.from('p');
    const xlsxBuf = Buffer.from('x');
    analyticsService.getDetailedAnalytics.mockResolvedValue({});
    exportService.generatePDF.mockResolvedValue(pdfBuf);
    exportService.generateExcel.mockResolvedValue(xlsxBuf);
    User.find = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([{ email: 'a@b', name: 'A' }]) });

    await ScheduledReportsService.sendMonthlyReport();

    expect(exportService.generateExcel).toHaveBeenCalled();
    expect(User.find).toHaveBeenCalled();
  });

  test('sendCustomReport returns sent count and uses excel when format excel', async () => {
    const xlsx = Buffer.from('x');
    analyticsService.getDetailedAnalytics.mockResolvedValue({});
    exportService.generateExcel.mockResolvedValue(xlsx);
    User.find = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([{ email: 'a', name: 'A' }, { email: 'b', name: 'B' }]) });

    const out = await ScheduledReportsService.sendCustomReport(['a','b'], new Date(0), new Date(), 'excel');
    expect(out.success).toBe(true);
    expect(out.sent).toBe(2);
  });
});