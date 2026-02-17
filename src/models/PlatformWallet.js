import mongoose from 'mongoose';

/**
 * PlatformWallet Model
 * 
 * Singleton model to track platform revenue from fees.
 * There should only be one document in this collection.
 * 
 * Platform fees are collected when:
 * - Escrow is released to freelancer (5% fee)
 * - Any other platform charges
 */
const platformWalletSchema = new mongoose.Schema(
  {
    // Identifier for the platform wallet (should be 'main')
    identifier: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
    },
    // Total available balance (fees collected and available for withdrawal)
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total fees collected all-time
    totalFeesCollected: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total amount withdrawn from platform wallet
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total number of fee transactions
    totalTransactions: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Version for optimistic locking
    version: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
    },
    // Last fee collection timestamp
    lastFeeCollectedAt: {
      type: Date,
    },
    // Statistics by period
    monthlyStats: [{
      year: Number,
      month: Number, // 1-12
      feesCollected: { type: Number, default: 0 },
      transactionCount: { type: Number, default: 0 },
    }],
    // Daily revenue for recent 30 days (for charts)
    dailyRevenue: [{
      date: Date,
      amount: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure only one platform wallet exists
platformWalletSchema.index({ identifier: 1 }, { unique: true });

/**
 * Get or create the platform wallet
 * @returns {Promise<Document>} Platform wallet document
 */
platformWalletSchema.statics.getWallet = async function () {
  let wallet = await this.findOne({ identifier: 'main' });
  if (!wallet) {
    wallet = await this.create({ identifier: 'main' });
  }
  return wallet;
};

/**
 * Atomically add fee to platform wallet
 * @param {Number} amount - Fee amount to add
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Document>} Updated wallet
 */
platformWalletSchema.statics.addFee = async function (amount, session = null) {
  if (amount <= 0) {
    throw new Error('Fee amount must be positive');
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const options = session ? { session, new: true, upsert: true } : { new: true, upsert: true };

  // Update or create with atomic operations
  const wallet = await this.findOneAndUpdate(
    { identifier: 'main' },
    {
      $inc: {
        availableBalance: amount,
        totalFeesCollected: amount,
        totalTransactions: 1,
        version: 1,
      },
      $set: {
        lastFeeCollectedAt: now,
      },
      $setOnInsert: {
        identifier: 'main',
        currency: 'PKR',
      },
    },
    options
  );

  // Update monthly stats (separate operation for simplicity)
  await this.updateOne(
    { 
      identifier: 'main',
      'monthlyStats.year': year,
      'monthlyStats.month': month,
    },
    {
      $inc: {
        'monthlyStats.$.feesCollected': amount,
        'monthlyStats.$.transactionCount': 1,
      },
    },
    session ? { session } : {}
  ).then(async (result) => {
    // If no matching month found, add new entry
    if (result.modifiedCount === 0) {
      await this.updateOne(
        { identifier: 'main' },
        {
          $push: {
            monthlyStats: {
              year,
              month,
              feesCollected: amount,
              transactionCount: 1,
            },
          },
        },
        session ? { session } : {}
      );
    }
  });

  return wallet;
};

/**
 * Get platform revenue statistics
 * @param {Number} months - Number of months to include (default 12)
 * @returns {Promise<Object>} Revenue statistics
 */
platformWalletSchema.statics.getRevenueStats = async function (months = 12) {
  const wallet = await this.getWallet();
  
  // Get monthly stats for the last N months
  const now = new Date();
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  
  const relevantStats = (wallet.monthlyStats || []).filter(stat => {
    const statDate = new Date(stat.year, stat.month - 1, 1);
    return statDate >= cutoffDate;
  }).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return {
    totalFeesCollected: wallet.totalFeesCollected,
    availableBalance: wallet.availableBalance,
    totalWithdrawn: wallet.totalWithdrawn,
    totalTransactions: wallet.totalTransactions,
    monthlyBreakdown: relevantStats,
    lastFeeCollectedAt: wallet.lastFeeCollectedAt,
  };
};

/**
 * Record withdrawal from platform wallet
 * @param {Number} amount - Amount to withdraw
 * @param {Object} session - MongoDB session
 * @returns {Promise<Document>} Updated wallet
 */
platformWalletSchema.statics.recordWithdrawal = async function (amount, session = null) {
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };

  const wallet = await this.findOneAndUpdate(
    { 
      identifier: 'main',
      availableBalance: { $gte: amount },
    },
    {
      $inc: {
        availableBalance: -amount,
        totalWithdrawn: amount,
        version: 1,
      },
    },
    options
  );

  if (!wallet) {
    throw new Error('Insufficient platform balance');
  }

  return wallet;
};

/**
 * Get today's revenue
 * @returns {Promise<Number>} Today's total fees
 */
platformWalletSchema.statics.getTodayRevenue = async function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const Transaction = mongoose.model('Transaction');
  
  const result = await Transaction.aggregate([
    {
      $match: {
        type: 'PLATFORM_FEE',
        status: 'SUCCESS',
        createdAt: { $gte: today, $lt: tomorrow },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    amount: result[0]?.total || 0,
    count: result[0]?.count || 0,
  };
};

const PlatformWallet = mongoose.model('PlatformWallet', platformWalletSchema);

export default PlatformWallet;
