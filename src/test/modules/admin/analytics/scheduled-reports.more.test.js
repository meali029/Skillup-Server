// Add more tests for scheduled-reports.service
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

describe('ScheduledReportsService - extra tests', () => {
  test('sendReportEmail sends mail with excel attachment when provided', async () => {
    const transporter = { sendMail: jest.fn().mockResolvedValue(true) };
    // inject transporter
    ScheduledReportsService.transporter = transporter;

    await ScheduledReportsService.sendReportEmail('a@b', 'A', 'Custom', Buffer.from('p'), new Date(0), new Date(), Buffer.from('x'));

    expect(transporter.sendMail).toHaveBeenCalled();
    const options = transporter.sendMail.mock.calls[0][0];
    expect(options.attachments.length).toBe(2);
  });

  test('sendCustomReport returns 0 if no admins found', async () => {
    analyticsService.getDetailedAnalytics.mockResolvedValue({});
    exportService.generatePDF.mockResolvedValue(Buffer.from('p'));
    User.find = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) });

    const out = await ScheduledReportsService.sendCustomReport(['a'], new Date(0), new Date(), 'pdf');
    expect(out.success).toBe(true);
    expect(out.sent).toBe(0);
  });

  test('sendCustomReport throws when underlying error occurs', async () => {
    analyticsService.getDetailedAnalytics.mockRejectedValue(new Error('fail'));
    await expect(ScheduledReportsService.sendCustomReport(['a'], new Date(0), new Date(), 'pdf')).rejects.toThrow('fail');
  });
});