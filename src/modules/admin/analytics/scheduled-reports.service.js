import cron from 'node-cron';
import nodemailer from 'nodemailer';
import analyticsService from './analytics.service.js';
import exportService from './export.service.js';
import User from '../../../models/User.js';
import logger from '../../../core/utils/logger.js';

class ScheduledReportsService {
  constructor() {
    this.transporter = null;
    this.initializeEmailTransporter();
    this.scheduleReports();
  }

  /**
   * Initialize email transporter
   */
  initializeEmailTransporter() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  /**
   * Schedule reports
   */
  scheduleReports() {
    // Weekly report - Every Monday at 9:00 AM
    cron.schedule('0 9 * * 1', async () => {
      logger.info('Running weekly scheduled report');
      await this.sendWeeklyReport();
    });

    // Monthly report - 1st day of month at 9:00 AM
    cron.schedule('0 9 1 * *', async () => {
      logger.info('Running monthly scheduled report');
      await this.sendMonthlyReport();
    });

    logger.info('Scheduled reports initialized');
  }

  /**
   * Send weekly report
   */
  async sendWeeklyReport() {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate - 7 * 24 * 60 * 60 * 1000);

      const analytics = await analyticsService.getDetailedAnalytics(startDate, endDate);
      const pdfBuffer = await exportService.generatePDF(analytics);

      // Get all admin emails
      const admins = await User.find({ role: 'admin', isActive: true }).select('email name');

      for (const admin of admins) {
        await this.sendReportEmail(admin.email, admin.name, 'Weekly', pdfBuffer, startDate, endDate);
      }

      logger.info(`Weekly report sent to ${admins.length} admins`);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
    }
  }

  /**
   * Send monthly report
   */
  async sendMonthlyReport() {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate - 30 * 24 * 60 * 60 * 1000);

      const analytics = await analyticsService.getDetailedAnalytics(startDate, endDate);
      const pdfBuffer = await exportService.generatePDF(analytics);
      const excelBuffer = await exportService.generateExcel(analytics);

      // Get all admin emails
      const admins = await User.find({ role: 'admin', isActive: true }).select('email name');

      for (const admin of admins) {
        await this.sendReportEmail(
          admin.email,
          admin.name,
          'Monthly',
          pdfBuffer,
          startDate,
          endDate,
          excelBuffer
        );
      }

      logger.info(`Monthly report sent to ${admins.length} admins`);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
    }
  }

  /**
   * Send report email
   */
  async sendReportEmail(email, name, reportType, pdfBuffer, startDate, endDate, excelBuffer = null) {
    const attachments = [
      {
        filename: `${reportType.toLowerCase()}-analytics.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ];

    if (excelBuffer) {
      attachments.push({
        filename: `${reportType.toLowerCase()}-analytics.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    const mailOptions = {
      from: `"SkillUp Platform" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${reportType} Analytics Report - ${new Date().toLocaleDateString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">SkillUp Platform - ${reportType} Analytics Report</h2>
          
          <p>Hello ${name},</p>
          
          <p>Your ${reportType.toLowerCase()} analytics report is ready!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Report Period:</strong></p>
            <p style="margin: 5px 0;">${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</p>
          </div>
          
          <p>The attached ${attachments.length === 1 ? 'file contains' : 'files contain'} detailed analytics including:</p>
          <ul>
            <li>Dashboard Metrics</li>
            <li>User Growth Statistics</li>
            <li>Revenue Report</li>
            <li>Top Performers</li>
            <li>Job Category Distribution</li>
            <li>Flagged Jobs Report</li>
          </ul>
          
          <p>For more details, please visit the <a href="${process.env.CLIENT_URL}/admin/analytics" style="color: #10b981;">Analytics Dashboard</a>.</p>
          
          <p>Best regards,<br>SkillUp Platform Team</p>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email.</p>
        </div>
      `,
      attachments
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send custom report
   */
  async sendCustomReport(adminIds, startDate, endDate, format = 'pdf') {
    try {
      const analytics = await analyticsService.getDetailedAnalytics(startDate, endDate);
      
      let buffer;
      let contentType;
      let filename;

      if (format === 'excel') {
        buffer = await exportService.generateExcel(analytics);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'analytics.xlsx';
      } else {
        buffer = await exportService.generatePDF(analytics);
        contentType = 'application/pdf';
        filename = 'analytics.pdf';
      }

      const admins = await User.find({ 
        _id: { $in: adminIds }, 
        role: 'admin', 
        isActive: true 
      }).select('email name');

      for (const admin of admins) {
        await this.sendReportEmail(admin.email, admin.name, 'Custom', buffer, startDate, endDate);
      }

      return { success: true, sent: admins.length };
    } catch (error) {
      logger.error('Error sending custom report:', error);
      throw error;
    }
  }
}

export default new ScheduledReportsService();
