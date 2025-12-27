import ExportService from '../../../../modules/admin/analytics/export.service.js';

beforeEach(() => jest.resetAllMocks());

describe('ExportService', () => {
  test('generateExcel returns buffer', async () => {
    const analytics = { metrics: { totalRevenue: { total: 100 }, platformFees: { total: 10 }, activeUsers: { daily: 1, weekly: 2, monthly: 3 }, jobStats: { posted: 1, completed: 1, completionRate: '100.00', avgValue: 100 }, topFreelancers: [], topClients: [], verificationStats: { verified: 1, pending: 0 } }, revenue: [], categories: [] };

    class MockWorkbook {
      constructor() {
        this.creator = null;
        this.created = null;
        this.xlsx = { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('xlsx')) };
      }
      addWorksheet(name) {
        return {
          columns: [],
          addRows: jest.fn(),
          addRow: jest.fn()
        };
      }
    }

    const buf = await ExportService.generateExcel(analytics, MockWorkbook);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('generateCSV returns csv string', async () => {
    const analytics = { metrics: { totalRevenue: { total: 100 }, platformFees: { total: 10 }, activeUsers: { daily: 1 }, jobStats: { posted: 1, completed: 1 }, }, revenue: [{ _id: { year: 2020, month: 1 }, revenue: 100, platformFee: 10, jobCount: 1 }], categories: [{ _id: 'dev', count: 2 }] };
    const csv = await ExportService.generateCSV(analytics);
    expect(typeof csv).toBe('string');
    expect(csv).toContain('"type"');
  });

  test('generatePDF returns buffer', async () => {
    const analytics = {
      metrics: {
        totalRevenue: { total: 100 },
        platformFees: { total: 10 },
        activeUsers: { daily: 1, weekly: 2, monthly: 3 },
        jobStats: { posted: 1, completed: 1, completionRate: '100.00', avgValue: 100 },
        topFreelancers: [{ name: 'F', completedJobs: 1, totalEarnings: 100 }],
        topClients: [{ name: 'C', jobsPosted: 1, totalSpent: 50 }],
        verificationStats: { verified: 1, pending: 0 }
      },
      revenue: [{ _id: { year: 2020, month: 1 }, revenue: 100, jobCount: 1 }],
      categories: [{ _id: 'dev', count: 2, totalValue: 200 }],
      period: { start: new Date(0), end: new Date() }
    };

    class MockPDF {
      constructor() {
        this._listeners = {};
      }
      on(ev, cb) {
        this._listeners[ev] = cb;
        if (ev === 'end') setTimeout(() => { if (this._listeners.data) this._listeners.data(Buffer.from('chunk')); cb(); }, 0);
      }
      fontSize() { return this; }
      moveDown() { return this; }
      text() { return this; }
      addPage() { return this; }
      end() { if (this._listeners.data) this._listeners.data(Buffer.from('chunk')); if (this._listeners.end) this._listeners.end(); }
    }

    const buf = await ExportService.generatePDF(analytics, MockPDF);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});