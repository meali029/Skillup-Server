import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['subscription', 'renewal', 'upgrade'],
      required: true,
    },
    plan: {
      type: String,
      enum: ['free', 'lite', 'pro', 'business'],
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'PKR',
    },
    status: {
      type: String,
      enum: ['paid', 'refunded'],
      default: 'paid',
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    items: [invoiceItemSchema],
    proratedCredit: {
      type: Number,
      default: 0,
      min: 0,
    },
    periodStart: { type: Date },
    periodEnd: { type: Date },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ userId: 1, createdAt: -1 });

/**
 * Generate a unique invoice number: INV-YYYYMMDD-XXXX
 */
invoiceSchema.statics.generateInvoiceNumber = async function () {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${dateStr}-`;

  const latest = await this.findOne({ invoiceNumber: { $regex: `^${prefix}` } })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.invoiceNumber.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
};

export default mongoose.models.Invoice ||
  mongoose.model('Invoice', invoiceSchema);
