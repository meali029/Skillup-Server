import PDFDocument from 'pdfkit';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import { createAppError } from '../core/errors/index.js';
import { PLAN_LIMITS } from '../config/subscription.config.js';
import logger from '../core/utils/logger.js';

class InvoiceService {
  /**
   * Create an invoice after a successful subscription purchase/renewal/upgrade
   */
  async createInvoice({ userId, subscriptionId, transactionId, type, plan, billingCycle, amount, proratedCredit = 0, periodStart, periodEnd }) {
    const invoiceNumber = await Invoice.generateInvoiceNumber();
    const planConfig = PLAN_LIMITS[plan];
    const planName = planConfig?.name || plan;

    const items = [];

    if (type === 'upgrade' && proratedCredit > 0) {
      items.push({
        description: `${planName} Plan (${billingCycle}) — new subscription`,
        quantity: 1,
        unitPrice: amount + proratedCredit,
        total: amount + proratedCredit,
      });
      items.push({
        description: 'Prorated credit from previous plan',
        quantity: 1,
        unitPrice: -proratedCredit,
        total: -proratedCredit,
      });
    } else {
      const label = type === 'renewal' ? 'Renewal' : 'Subscription';
      items.push({
        description: `${planName} Plan (${billingCycle}) — ${label}`,
        quantity: 1,
        unitPrice: amount,
        total: amount,
      });
    }

    const invoice = await Invoice.create({
      userId,
      subscriptionId,
      transactionId,
      invoiceNumber,
      type,
      plan,
      billingCycle,
      amount,
      proratedCredit,
      periodStart,
      periodEnd,
      items,
      paidAt: new Date(),
    });

    logger.info(`[Invoice] Created ${invoiceNumber} for user ${userId}`);
    return invoice;
  }

  /**
   * Get a single invoice with ownership check
   */
  async getInvoice(invoiceId, userId) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw createAppError('Invoice not found', 404);
    if (invoice.userId.toString() !== userId.toString()) {
      throw createAppError('Not authorized to view this invoice', 403);
    }
    return invoice;
  }

  /**
   * Get paginated invoices for a user
   */
  async getUserInvoices(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments({ userId }),
    ]);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generate a PDF buffer for an invoice
   */
  async generatePDF(invoiceId, userId) {
    const invoice = await this.getInvoice(invoiceId, userId);
    const user = await User.findById(userId).select('name email').lean();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('SkillUp Pakistan', 50, 50);
      doc.fontSize(10).font('Helvetica').text('Freelance Marketplace', 50, 80);
      doc.moveDown(2);

      // Invoice title
      doc.fontSize(18).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
      doc.fontSize(10).font('Helvetica')
        .text(`Invoice #: ${invoice.invoiceNumber}`, { align: 'right' })
        .text(`Date: ${new Date(invoice.paidAt).toLocaleDateString('en-PK')}`, { align: 'right' })
        .text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });

      doc.moveDown(2);

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Bill To
      doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
      doc.fontSize(10).font('Helvetica')
        .text(user?.name || 'N/A')
        .text(user?.email || 'N/A');
      doc.moveDown();

      // Plan details
      doc.fontSize(12).font('Helvetica-Bold').text('Subscription Details:');
      doc.fontSize(10).font('Helvetica')
        .text(`Plan: ${(PLAN_LIMITS[invoice.plan]?.name || invoice.plan)} (${invoice.billingCycle})`)
        .text(`Type: ${invoice.type.charAt(0).toUpperCase() + invoice.type.slice(1)}`);
      if (invoice.periodStart && invoice.periodEnd) {
        doc.text(`Period: ${new Date(invoice.periodStart).toLocaleDateString('en-PK')} — ${new Date(invoice.periodEnd).toLocaleDateString('en-PK')}`);
      }
      doc.moveDown(2);

      // Items table header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Description', 50, tableTop, { width: 300 });
      doc.text('Qty', 360, tableTop, { width: 50, align: 'center' });
      doc.text('Price', 420, tableTop, { width: 60, align: 'right' });
      doc.text('Total', 490, tableTop, { width: 55, align: 'right' });

      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

      // Items
      let y = tableTop + 25;
      doc.font('Helvetica').fontSize(10);
      for (const item of invoice.items) {
        doc.text(item.description, 50, y, { width: 300 });
        doc.text(String(item.quantity), 360, y, { width: 50, align: 'center' });
        doc.text(`PKR ${item.unitPrice.toLocaleString()}`, 420, y, { width: 60, align: 'right' });
        doc.text(`PKR ${item.total.toLocaleString()}`, 490, y, { width: 55, align: 'right' });
        y += 20;
      }

      // Total line
      doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke();
      y += 15;
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('Total:', 420, y, { width: 60, align: 'right' });
      doc.text(`PKR ${invoice.amount.toLocaleString()}`, 490, y, { width: 55, align: 'right' });

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text(
        'Thank you for your subscription to SkillUp Pakistan. This is a computer-generated invoice.',
        50,
        750,
        { align: 'center', width: 495 }
      );

      doc.end();
    });
  }
}

export default new InvoiceService();
