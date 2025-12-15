import analyticsService from './analytics.service.js';
import exportService from './export.service.js';

/**
 * Get dashboard metrics
 */
export const getDashboardMetrics = async (req, res, next) => {
  try {
    const metrics = await analyticsService.getDashboardMetrics();

    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user growth report
 */
export const getUserGrowthReport = async (req, res, next) => {
  try {
    const { startDate, endDate, interval = 'day' } = req.query;

    const data = await analyticsService.getUserGrowthReport(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      interval
    );

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue report
 */
export const getRevenueReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const data = await analyticsService.getRevenueReport(
      startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job category distribution
 */
export const getCategoryDistribution = async (req, res, next) => {
  try {
    const data = await analyticsService.getJobCategoryDistribution();

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get flagged jobs report
 */
export const getFlaggedJobsReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const data = await analyticsService.getFlaggedJobsReport(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export analytics to PDF
 */
export const exportToPDF = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await analyticsService.getDetailedAnalytics(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    const pdfBuffer = await exportService.generatePDF(analytics);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${Date.now()}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export analytics to Excel
 */
export const exportToExcel = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await analyticsService.getDetailedAnalytics(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    const excelBuffer = await exportService.generateExcel(analytics);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${Date.now()}.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export analytics to CSV
 */
export const exportToCSV = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await analyticsService.getDetailedAnalytics(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    const csvData = await exportService.generateCSV(analytics);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${Date.now()}.csv`);
    res.send(csvData);
  } catch (error) {
    next(error);
  }
};
